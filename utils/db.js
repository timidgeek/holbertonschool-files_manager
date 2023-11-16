// import mongodb client
const { MongoClient } = require('mongodb');

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';

const url = `mongodb://${host}:${port}/${database}`;
class DBClient {
  // constructor to create client to MongoDB
  constructor() {
    this.client = new MongoClient(url, { useUnifiedTopology: true });

    this.client.connect()
      .then(() => {
        this.db = this.client.db(database);
        console.log('MongoDB connected');
      })
      .catch(err => console.error('MongoDB connection error:', err));
  }


  // check if connection success
  isAlive() {
    try {
      await this.client.connect();
      this.db = this.client.db();
      return true;
    } catch (error) {
      return false;
    }
  }

  async nbUsers() {
    const numDocs = await this.db.collection('users').countDocuments({});
    return numDocs;
  }

  async nbFiles() {
    const numDocs = await this.db.collection('files').countDocuments({});
    return numDocs;
  }
}

// export DBClient instance
const dbClient = new DBClient();
module.exports = dbClient;
