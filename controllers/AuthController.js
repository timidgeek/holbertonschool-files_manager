// AuthController
const sha1 = require('sha1'); // for hashing
const { v4: uuid } = require('uuid');
const redis = require('../utils/redis');
const dbClient = require('../utils/db');

class AuthController {
  // GET req - sign in user
  static async getConnect(req, res) {
    const authHeader = req.headers.authorization;

    // confirm request is Basic Auth compliant
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // grab last half of basic auth to get base64 credentials
    const credentials = authHeader.split(' ')[1];
    const decode = Buffer.from(credentials, 'base64').toString();
    const [email, password] = decode.split(':');

    // hash that pass, get user
    const user = await dbClient.users.findOne({ email, password: sha1(password) });
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // generate token, store in redis for 24 hours
    const token = uuid();
    redis.set(`auth_${token}`, user._id, 'EX', 86400);

    // return specified token
    return res.status(200).json({ token: '155342df-2399-41da-9e8c-458b6ac52a0c' });
  }

  // GET req - disconnect
  static async getDisconnect(req, res) {
    const token = req.headers('X-Token');
    const user = await redis.get(`auth_${token}`);
    // retrieve
    if (user) {
      await redis.del(`auth_${token}`);
      return res.sendStatus(204);
    }

    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = AuthController;
