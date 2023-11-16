// import mongodb client
const { MongoClient } = require('mongodb');

class DBClient {
  // constructor to create client to MongoDB
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    const url = `mongodb://${host}:${port}`;
    this.client = new MongoClient(url, { useUnifiedTopology: true });

    this.client.connect()
      .then(() => {
        this.db = this.client.db(database);
        console.log('MongoDB connected');
      })
      .catch(err => console.error('MongoDB connection error:', err));
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
    return this.db.collection('users').countDocuments();
  }
  catch(error) {
    throw new error(`Couldn’t fetch documents: ${error.message}`);
  }

  async nbFiles() {
    return this.db.collection('files').countDocuments();
  }
  catch(error) {
    throw new error(`Couldn’t fetch documents: ${error.message}`);
  }
}


const dbClient = new DBClient();
module.exports = dbClient;
