const User = require('../models/user');
const Task = require('../models/task');

module.exports = function (router) {
  const usersRoute = router.route('/users');
  const usersRouteById = router.route('/users/:userId');

  const parseJSON = (input, defaultValue) => {
    try {
      return input ? JSON.parse(input) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  // ----------------------------------------------------------
  // POST /users → Create a new user
  // ----------------------------------------------------------
  usersRoute.post(async (req, res) => {
    try {
      const { name, email } = req.body;
      if (!name || !email) {
        return res.status(400).json({ message: 'Missing required fields: name and email', data: null });
      }

      const user = new User({ name, email, pendingTasks: [] });
      const savedUser = await user.save();

      res.status(201).json({ message: 'User created successfully', data: savedUser });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Email already exists. Please use a different email.', data: null });
      }
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Error creating user', data: null });
    }
  });

  // ----------------------------------------------------------
  // GET /users → List users (with query parameters)
  // ----------------------------------------------------------
  usersRoute.get(async (req, res) => {
    try {
      const where = parseJSON(req.query.where, {});
      const sort = parseJSON(req.query.sort, {});
      const select = parseJSON(req.query.select, {});
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 0;
      const count = req.query.count === 'true';

      if (count) {
        const total = await User.countDocuments(where);
        return res.json({ message: 'OK', data: { count: total } });
      }

      const users = await User.find(where)
        .sort(sort)
        .select(select)
        .skip(skip)
        .limit(limit)
        .exec();

      res.json({ message: 'OK', data: users });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ message: 'Error fetching users', data: null });
    }
  });

  // ----------------------------------------------------------
  // GET /users/:id → Get specific user
  // ----------------------------------------------------------
  usersRouteById.get(async (req, res) => {
    try {
      const userId = req.params.userId;
      const select = parseJSON(req.query.select, {});
      const user = await User.findById(userId).select(select).exec();
      if (!user) return res.status(404).json({ message: 'User not found', data: null });
      res.json({ message: 'OK', data: user });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Error fetching user', data: null });
    }
  });

  // ----------------------------------------------------------
  // PUT /users/:id → Replace user
  // ----------------------------------------------------------
  usersRouteById.put(async (req, res) => {
    try {
      const userId = req.params.userId;
      const { name, email, pendingTasks } = req.body;

      if (!name || !email) {
        return res.status(400).json({ message: 'Missing required fields: name and email', data: null });
      }

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found', data: null });

      user.name = name;
      user.email = email;
      user.pendingTasks = pendingTasks || [];

      const updatedUser = await user.save();
      res.json({ message: 'User updated successfully', data: updatedUser });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Email already exists. Please use a different email.', data: null });
      }
      console.error('Error updating user:', error);
      res.status(400).json({ message: 'Error updating user', data: null });
    }
  });

  // ----------------------------------------------------------
  // DELETE /users/:id → Delete user
  // ----------------------------------------------------------
  usersRouteById.delete(async (req, res) => {
    try {
      const userId = req.params.userId;
      const deletedUser = await User.findByIdAndDelete(userId).exec();
      if (!deletedUser) return res.status(404).json({ message: 'User not found', data: null });

      await Task.updateMany(
        { assignedUser: userId },
        { $set: { assignedUser: "", assignedUserName: "unassigned" } }
      );

      res.status(204).json({ message: 'User deleted successfully', data: deletedUser });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ message: 'Error deleting user', data: null });
    }
  });

  return router;
};
