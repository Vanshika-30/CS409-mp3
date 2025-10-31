const User = require('../models/user');
const Task = require('../models/task');

module.exports = function (router) {

  const usersRoute = router.route('/users');
  const usersRouteById = router.route('/users/:userId');

  // ----------------------------------------------------------
  // POST /users → Create a new user
  // ----------------------------------------------------------
  usersRoute.post(async function (req, res) {
    try {
      const { name, email } = req.body;

      // Validation
      if (!name || !email) {
        return res.status(400).json({ message: 'Missing required fields: name and email' });
      }

      const user = new User({
        name,
        email,
        pendingTasks: [],
        dateCreated: new Date()
      });

      const savedUser = await user.save();
      res.status(201).json({ message: 'User created!', data: savedUser });

    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Error creating user', error: error.message });
    }
  });

  // ----------------------------------------------------------
  // GET /users → Get all users
  // ----------------------------------------------------------
  usersRoute.get(async function (req, res) {
    try {
      const users = await User.find();
      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
  });

  // ----------------------------------------------------------
  // GET /users/:userId → Get details of a specific user
  // ----------------------------------------------------------
  usersRouteById.get(async function (req, res) {
    try {
      const userId = req.params.userId;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({ message: 'Error fetching user details', error: error.message });
    }
  });

  // ----------------------------------------------------------
  // PUT /users/:userId → Replace entire user
  // ----------------------------------------------------------
  usersRouteById.put(async function (req, res) {
    try {
      const userId = req.params.userId;
      const { name, email, pendingTasks } = req.body;

      // Validation
      if (!name || !email) {
        return res.status(400).json({ message: 'Missing required fields: name and email' });
      }

      const existingUser = await User.findById(userId);
      if (!existingUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Update fields
      existingUser.name = name;
      existingUser.email = email;
      existingUser.pendingTasks = pendingTasks || existingUser.pendingTasks;

      const updatedUser = await existingUser.save();
      res.json(updatedUser);

    } catch (error) {
      console.error('Error updating user:', error);
      res.status(400).json({ message: 'Error updating user', error: error.message });
    }
  });

  // ----------------------------------------------------------
  // DELETE /users/:userId → Delete a user
  // ----------------------------------------------------------
  usersRouteById.delete(async function (req, res) {
    try {
      const userId = req.params.userId;
      const deletedUser = await User.findByIdAndRemove(userId);

      if (!deletedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Unassign this user from their tasks
      await Task.updateMany(
        { assignedUser: userId },
        { $set: { assignedUser: "", assignedUserName: "unassigned" } }
      );

      res.json({ message: 'User deleted successfully', data: deletedUser });

    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
  });

  return router;
};
