// AuthController
const sha1 = require('sha1'); // for hashing
const { v4: uuid } = require('uuid');
const redis = require('../utils/redis');
const dbClient = require('../utils/db');


const AuthController = {
  // GET req - sign in user
  async getConnect(req, res) {
    const authHeader = req.headers.authorization;
    // confirm request is Basic Auth compliant
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // grab last half of basic auth to get base64 credentials
    const credentials = authHeader.split(' ')[1];
    const decode = Buffer.from(credentials, 'base64').toString();
    const [email, password] = decode.split(':');

    if (!email || !password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // hash that pass, get user
    const hashedPassword = sha1(password);
    const user = await dbClient.users.findOne({ email, password: hashedPassword });

    if (!user || user.password !== hashedPassword) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // generate token, store in redis for 24 hours
    const token = uuid();
    await redis.set(`auth_${token}`, user._id.toString(), 86400)

    return res.status(200).json({ token });
  },

  // GET req - disconnect
  async getDisconnect(req, res) {
    const token = req.header('X-Token');
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
