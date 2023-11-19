// UsersController
const sha1 = require('sha1'); // for hashing
const mongo = require('mongodb');
const redis = require('../utils/redis');
const dbClient = require('../utils/db');

class UsersController {
  // POST req - new User
  static async postNew(req, res) {
    const { email, password } = req.body;

    // check if email is missing
    if (!req.body.email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    // check if password is missing
    if (!req.body.password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    // check if the email already exists
    const userExists = await dbClient.users.findOne({ email });
    if (userExists) {
      return res.status(400).json({ error: 'Already exist' });
    }

    // hash that pass
    const hashPass = sha1(password);

    // create new user
    const newUser = await dbClient.users.insertOne({
      email,
      password: hashPass,
    });

    // endpoint returns new user w one email and id
    return res.status(201).json({ id: newUser.insertedId, email });
  }

  // GET req - retrieve user from token
  static async getMe(req, res) {
    const token = req.header('X-Token');
    const redisToken = await redis.get(`auth_${token}`);

    if (!redisToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // get user by redis token
    const userId = new mongo.ObjectId(redisToken);
    const user = await dbClient.users.findOne({ _id: userId });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // return user object email & id
    return res.status(200).json({ id: user._id.toSting, email: user.email });
  } catch(error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = UsersController;
