// import mongodb client
const { MongoClient } = require('mongodb');

class DBClient {
  // constructor to create client to MongoDB
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';
    const uri = `mongodb://${host}:${port}/${database}`;

    // initiate MongoDB client
    this.client = new MongoClient(uri, { userNewUrlParser: true, useUnifiedTopology: true });
    this.db = null; // MongoDB client instance
  }

  // check if connection success
  async isAlive() {
    try {
      await this.client.connect();
      this.db = this.client.db();
      return true;
    } catch (error) {
      return false;
    }
  }

  // return number of docs in collection `users`
  async nbUsers() {
    try {
      const usersCollection = this.db.collection('users');
      const numDocs = await usersCollection.countDocuments();
      return numDocs;
    } catch (error) {
      throw new error (`Couldn't fetch documents: ${error.message}`);
    }
  }
  // return number of docs in collection `files`
  async nbFiles() {
    try {
      const filesCollection = this.db.collection('files');
      const numDocs = await filesCollection.countDocuments();
      return numDocs;
    } catch (error) {
      throw new error (`Couldn't fetch documents: ${error.message}`);
    }
  }
}

// export DBClient instance
const dbClient = new DBClient();
module.exports = dbClient;
