// import mongodb client
const { MongoClient } = require('mongodb');

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';

const url = `mongodb://${host}:${port}/${database}`;
const client = new MongoClient(url)

class DBClient {
  // constructor to create client to MongoDB
  constructor() {
    MongoClient.connect(url, { useUnifiedTopology: true }, (error, client) => {
      if (client) {
        this.db = client.db(database);
        this.users = this.db.collection('users');
        this.files = this.db.collection('files');
      }
      if (error) {
        this.db = false;
        console.log(error)
      }
    });

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

  async nbUsers() {
    const numDocs = await this.users.countDocuments({});
    return numDocs;
  }

  async nbFiles() {
    const numDocs = await this.users.countDocuments({});
    return numDocs;
  }
}

// export DBClient instance
const dbClient = new DBClient();
module.exports = dbClient;
