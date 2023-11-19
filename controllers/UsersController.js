// UsersController
const sha1 = require('sha1'); // for hashing
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
}

module.exports = UsersController;
