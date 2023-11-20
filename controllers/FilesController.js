// Task 5 First File, 6 Get and list file, 7 File publish/unpublish, 8 File data, 9 Image Thumbnails
const { v4: uuidv4 } = require('uuid');
const mongodb = require('mongodb');
const fsp = require('fs').promises;
const fs = require('fs');
const mime = require('mime-types');
const Mongo = require('../utils/db');
const Redis = require('../utils/redis');

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
    const authToken = `auth_${token}`;
    const userIdString = await Redis.get(authToken);
    if (!userIdString) return res.status(401).json({ error: 'Unauthorized' });

    // Parse userId from string to mongodb.ObjectID
    const userId = new mongodb.ObjectID(userIdString);

    // Extract the file metadata from the request body
    const {
      name,
      type,
      parentId = '0',
      data,
      isPublic = false,
    } = req.body;

    // Validate the file metadata
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!['folder', 'file', 'image'].includes(type)) return res.status(400).json({ error: 'Missing type' });
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

    // Check for valid parent_id
    let parentObjectId;
    if (parentId !== '0') {
      try {
        parentObjectId = new mongodb.ObjectID(parentId);
      } catch (e) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      const parent = await Mongo.db.collection('files').findOne({ _id: parentObjectId });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    // Prepare file document to be saved to db
    const newFile = {
      userId,
      name,
      type,
      isPublic,
      parentId: parentId === '0' ? '0' : parentObjectId,
    };

    // If type is folder, save directly to db
    try {
      if (type === 'folder') {
        const result = await Mongo.db.collection('files').insertOne(newFile);
        return res.status(201).json({
          id: result.insertedId.toString(),
          userId: userId.toString(),
          name,
          type,
          isPublic,
          parentId: 0,
        });
      }
      // If type is file or image, save to disk and then to db
      const fileData = Buffer.from(data, 'base64');
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      await fsp.mkdir(folderPath, { recursive: true });
      const filePath = `${folderPath}/${uuidv4()}`;
      await fsp.writeFile(filePath, fileData);

      newFile.localPath = filePath;
      const result = await Mongo.db.collection('files').insertOne(newFile);

      return res.status(201).json({
        id: result.insertedId.toString(),
        userId: userId.toString(),
        name,
        type,
        isPublic,
        parentId: parentId === '0' ? 0 : parseInt(parentId, 10),
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
  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const { parentId = '0', page = 0 } = req.query;
    const skip = parseInt(page, 10) * 20;

    try {
      const userId = await getUserIdFromToken(token);

      console.log(`UserID: ${userId}, ParentID: ${parentId}`); // Debugging log

      const query = { userId };
      if (parentId !== '0') {
        query.parentId = parentId;
      }

      const files = await Mongo.db.collection('files')
        .find(query)
        .skip(skip)
        .limit(20)
        .toArray();

      console.log(`Files found: ${JSON.stringify(files)}`); // Debugging log

      return res.status(200).send(files.map((file) => ({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      })));
    } catch (error) {
      console.error(error);
      return res.status(500).send({ error: 'Server error' });
    }
  }

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

    try {
      // Fetch the file from the database
      const file = await Mongo.db.collection('files').findOne({ _id: new mongodb.ObjectID(fileId) });

      // Check if file exists
      if (!file) {
        return res.status(404).send({ error: 'Not found' });
      }

      // Check if the file is public or if the user is authenticated and owns the file
      if (!file.isPublic && (!token
        || file.userId.toString() !== (await getUserIdFromToken(token)))) {
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
