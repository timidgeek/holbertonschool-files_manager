// Task 5 First File, 6 Get and list file, 7 File publish/unpublish, 8 File data, 9 Image Thumbnails
const { v4: uuidv4 } = require('uuid');
const mongodb = require('mongodb');
const fsp = require('fs').promises;
const Mongo = require('../utils/db');
const Redis = require('../utils/redis');

// Extract and validate the token and file metadata from the request
class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-Token');
    const authToken = `auth_${token}`;
    const userIdString = await Redis.get(authToken);
    if (!userIdString) return res.status(401).send({ error: 'Unauthorized' });

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
    if (!name) return res.status(400).send({ error: 'Missing name' });
    if (!['folder', 'file', 'image'].includes(type)) return res.status(400).send({ error: 'Missing type' });
    if (!data && type !== 'folder') return res.status(400).send({ error: 'Missing data' });

    // Check for valid parent_id
    if (parentId !== '0') {
      const parentObjectId = new mongodb.ObjectID(parentId);
      const parent = await Mongo.db.collection('files').findOne({ _id: new mongodb.ObjectID(parentObjectId) });
      if (!parent) return res.status(400).send({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).send({ error: 'Parent is not a folder' });
    }

    // Prepare file document to be saved to db
    const newFile = {
      userId,
      name,
      type,
      isPublic,
      data,
      parentId,
    };

    // If type is folder, save directly to db
    try {
      if (type === 'folder') {
        const result = await Mongo.db.collection('files').insertOne(newFile);
        newFile._id = result.insertedId;
        return res.status(201).send(newFile);
      }
      // If type is file or image, save to disk and then to db
      const fileData = Buffer.from(data, 'base64');
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      await fsp.mkdir(folderPath, { recursive: true });
      const filePath = `${folderPath}/${uuidv4()}`;
      await fsp.writeFile(filePath, fileData);
      newFile.localPath = filePath;
      const result = await Mongo.db.collection('files').insertOne(newFile);
      newFile._id = result.insertedId;
      return res.status(201).send(newFile);
    } catch (error) {
      console.error(error);
      return res.status(500).send({ error: 'Server error' });
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
      return res.status(500).send({ error: 'Server error' });
    }
  }

  // List all files for a user, with optional parentId and pagination
  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const { parentId = '0', page = 0 } = req.query;
    const skip = parseInt(page, 10) * 20;

    // Ensure the token is provided
    if (!token) {
      return res.status(401).send({ error: 'Unauthorized' });
    }

    try {
      // Attempt to retrieve user's id from token
      const userId = await getUserIdFromToken(token);
      const query = { userId };

      // If parentId is provided and not 0, add it to the query
      if (parentId !== '0') {
        query.parentId = new mongodb.ObjectID(parentId);
      }

      // Fetch the files with pagination
      const files = await Mongo.db.collection('files')
        .find(query)
        .skip(skip)
        .limit(20)
        .toArray();

      return res.status(200).send(files);
    } catch (error) {
      console.error(error);
      return res.status(500).send({ error: 'Server error' });
    }
  }
}

module.exports = FilesController;
