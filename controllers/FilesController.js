// Task 5 First File, 6 Get and list file, 7 File publish/unpublish, 8 File data, 9 Image Thumbnails
const { v4: uuidv4 } = require('uuid');
const mongodb = require('mongodb');
const fsp = require('fs').promises;
const fs = require('fs');
const mime = require('mime-types');
const Mongo = require('../utils/db');
const Redis = require('../utils/redis');
const { fileQueue } = require('../worker');

// Helper function to retrieve user ID from a given token
async function getUserIdFromToken(token) {
  const userIdString = await Redis.get(`auth_${token}`);
  if (!userIdString) {
    throw new Error('Unauthorized');
  }
  return new mongodb.ObjectID(userIdString);
}

// Extract and validate the token and file metadata from the request
class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    // Retrieve the user ID from the token or return 401 Unauthorized
    let userId;
    try {
      userId = await getUserIdFromToken(token);
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Extract file metadata from the request body
    const {
      name, type, data, isPublic = false,
    } = req.body;
    let { parentId = '0' } = req.body;

    // Validate the required file metadata
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    if (!['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    // Check if the parentId is valid or set to root
    if (parentId !== '0') {
      parentId = new mongodb.ObjectID(parentId);
      const parent = await Mongo.db.collection('files').findOne({ _id: parentId, userId });
      if (!parent) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parent.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    } else {
      parentId = new mongodb.ObjectID(); // Create a new ObjectId to represent root
    }

    // Prepare the file document for the database
    const newFile = {
      userId,
      name,
      type,
      isPublic,
      parentId,
    };

    // Add a job to bull queue for image generator
    if (type === 'image') {
      const userIdString = await Redis.get(`auth_${token}`);
      await fileQueue.add({
        userId: userIdString,
        fileId: newFile.insertedId.toString(),
      });
    }

    try {
      // If the file is a folder, insert it directly into the database
      if (type === 'folder') {
        const result = await Mongo.db.collection('files').insertOne(newFile);
        return res.status(201).json({
          id: result.insertedId.toString(),
          userId: userId.toString(),
          name,
          type,
          isPublic,
          parentId: parentId.toString(),
        });
      }
      // For 'file' and 'image', handle storage and database insertion
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      const filePath = `${folderPath}/${uuidv4()}`;
      const fileData = Buffer.from(data, 'base64');
      await fsp.mkdir(folderPath, { recursive: true });
      await fsp.writeFile(filePath, fileData);
      newFile.localPath = filePath;
      const result = await Mongo.db.collection('files').insertOne(newFile);
      return res.status(201).json({
        id: result.insertedId.toString(),
        userId: userId.toString(),
        name,
        type,
        isPublic,
        parentId: parentId.toString(),
        localPath: filePath,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // Get a file by its id // Task 6
  static async getShow(req, res) {
    const fileId = req.params.id;
    const token = req.header('X-Token');

    // Ensure the token is provided
    if (!token) {
      return res.status(401).send({ error: 'Unauthorized' });
    }

    try {
      // Attempt to retrieve user's id from token
      const userId = await getUserIdFromToken(token);

      // Fetch the specified file
      const file = await Mongo.db.collection('files').findOne({
        _id: new mongodb.ObjectID(fileId),
        userId,
      });

      if (!file) {
        return res.status(404).send({ error: 'Not found' });
      }

      return res.status(200).send(file);
    } catch (error) {
      console.error(error);
      if (error.message === 'Unauthorized') {
        return res.status(401).send({ error: 'Unauthorized' });
      }
      // Handle other potential errors
      return res.status(500).send({ error: 'Server error' });
    }
  }

  // List all files for a user, with optional parentId and pagination
  // Task 6
  static async getIndex(req, res) {
    const token = req.header('X-Token');

    // Check for token and retrieve user ID or return 401 Unauthorized
    let userId;
    try {
      userId = await getUserIdFromToken(token);
    } catch (error) {
      console.error(error);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Extract parentId and page from query string
    const { parentId = '0', page = '0' } = req.query;
    const skip = parseInt(page, 10) * 20;

    try {
      // Construct query with parentId
      const matchQuery = { userId };
      if (parentId !== '0') {
        matchQuery.parentId = new mongodb.ObjectID(parentId);
      } else {
        matchQuery.parentId = '0';
      }

      // Use aggregation for pagination
      const files = await Mongo.db.collection('files').aggregate([
        { $match: matchQuery },
        { $skip: skip },
        { $limit: 20 },
      ]).toArray();

      // Convert MongoDB ObjectIDs to strings
      const responseFiles = files.map((file) => ({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      }));

      return res.status(200).send(responseFiles);
    } catch (error) {
      console.error(error);
      return res.status(500).send({ error: 'Server error' });
    }
  }

  // Publish a file by its id // Task 7
  static async putPublish(req, res) {
    const fileId = req.params.id;
    const token = req.header('X-Token');

    try {
      const userId = await getUserIdFromToken(token);

      const file = await Mongo.db.collection('files').findOneAndUpdate(
        { _id: new mongodb.ObjectID(fileId), userId },
        { $set: { isPublic: true } },
        { returnOriginal: false },
      );

      if (!file.value) {
        return res.status(404).send({ error: 'Not found' });
      }

      return res.status(200).send(file.value);
    } catch (error) {
      console.error(error);
      if (error.message === 'Unauthorized') {
        return res.status(401).send({ error: 'Unauthorized' });
      }
      return res.status(500).send({ error: 'Server error' });
    }
  }

  // Unpublish a file by its id // Task 7
  static async putUnpublish(req, res) {
    const fileId = req.params.id;
    const token = req.header('X-Token');

    try {
      const userId = await getUserIdFromToken(token);

      const file = await Mongo.db.collection('files').findOneAndUpdate(
        { _id: new mongodb.ObjectID(fileId), userId },
        { $set: { isPublic: false } },
        { returnOriginal: false },
      );

      if (!file.value) {
        return res.status(404).send({ error: 'Not found' });
      }

      return res.status(200).send(file.value);
    } catch (error) {
      console.error(error);
      if (error.message === 'Unauthorized') {
        return res.status(401).send({ error: 'Unauthorized' });
      }
      return res.status(500).send({ error: 'Server error' });
    }
  }

  // eslint-disable-next-line consistent-return
  static async getFile(req, res) {
    const fileId = req.params.id;
    const token = req.header('X-Token');
    let userId;

    // First, validate the token and get the user ID
    if (token) {
      try {
        userId = await getUserIdFromToken(token);
      } catch (error) {
        // If the token is invalid, return an Unauthorized error
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    try {
      // Build the query object based on whether the file is public or the user owns it
      const query = { _id: new mongodb.ObjectID(fileId) };
      if (userId) {
        query.$or = [{ isPublic: true }, { userId: new mongodb.ObjectID(userId) }];
      } else {
        query.isPublic = true;
      }

      // Accept size param for bull queue
      const { size } = req.query;

      // Check if local file exists with size param
      if (!['500', '250', '100'].includes(size)) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Fetch the file from the database using the constructed query
      const file = await Mongo.db.collection('files').findOne(query);

      // Check if file exists and the access control checks pass
      if (!file) {
        return res.status(404).send({ error: 'Not found' });
      }

      // Check if the file is a folder
      if (file.type === 'folder') {
        return res.status(400).send({ error: "A folder doesn't have content" });
      }

      // Check if the file exists on the server
      if (!fs.existsSync(file.localPath)) {
        return res.status(404).send({ error: 'Not found' });
      }

      // Serve the file with the correct MIME type
      res.type(mime.lookup(file.name) || 'application/octet-stream');
      fs.createReadStream(file.localPath).pipe(res);
    } catch (error) {
      console.error(error);
      res.status(500).send({ error: 'Server error' });
    }
  }
}

module.exports = FilesController;
