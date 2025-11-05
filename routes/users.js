const User = require('../models/user');
const Task = require('../models/task');
const mongoose = require('mongoose');

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
      const { name, email, pendingTasks = [] } = req.body;
      if (!name || !email) {
        return res.status(400).json({ message: 'Missing required fields: name and email', data: null });
      }

      // Add pending tasks after validation
      const validTasks = new Set();

      for (const tid of pendingTasks) {
        if (!tid || !mongoose.Types.ObjectId.isValid(tid)) {
            return res.status(400).json({ message: `Skipping invalid task ID: ${tid}`, data: null });
        }
        const task = await Task.findById(tid);
        if (!task){
          return res.status(404).json({ message: `Task ${tid} does not exist`, data: null });
        }

        // Prevent modifying completed tasks
        if(task.completed){
          return res.status(400).json({ message: 'Completed tasks cannot be modified', data: null });
        }

        // If belongs to another user
        if (task.assignedUser) {
          const oldUser = await User.findById(task.assignedUser);
          if (oldUser) {
            oldUser.pendingTasks = oldUser.pendingTasks.filter(tid2 => tid2.toString() !== tid);
            await oldUser.save();
          }
        }

        validTasks.add(tid);
      }

      const user = new User({ name, email, pendingTasks: [...validTasks] });
      const savedUser = await user.save();

      if (validTasks.size > 0) {
        await Task.updateMany(
          { _id: { $in: [...validTasks] } },
          { $set: { assignedUser: savedUser._id.toString(), assignedUserName: savedUser.name } }
        );

      }

      res.status(201).json({ message: 'User created successfully', data: savedUser });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Email already exists. Please use a different email.', data: null });
      }
      console.error('Error creating user:', error);
      res.status(500).json({ message: `Error creating user ${error}`, data: null });
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
        return res.status(200).json({ message: 'OK', data: { count: total } });
      }

      const users = await User.find(where)
        .sort(sort)
        .select(select)
        .skip(skip)
        .limit(limit)
        .exec();

      res.status(200).json({ message: 'OK', data: users });
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

      if (!user) {
        return res.status(404).json({ message: 'User not found', data: null });
      }

      res.status(200).json({ message: 'OK', data: user });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ message: 'Error fetching user', data: null });
    }
  });

  // ----------------------------------------------------------
  // PUT /users/:id → Update user and sync tasks
  // ----------------------------------------------------------
  usersRouteById.put(async (req, res) => {
    try {
      const userId = req.params.userId;
      const { name, email, pendingTasks = [] } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found', data: null });
      }

      const oldName = user.name;
      const oldPending = new Set(user.pendingTasks.map(String));

      // ---- Update fields ----
      if (name !== undefined) user.name = name;
      if (email !== undefined) user.email = email;

      const validTasks = new Set();
      // ---- Handle pendingTasks ----
      if (Array.isArray(pendingTasks)) {

        for (const tid of pendingTasks) {
          if (!tid || !mongoose.Types.ObjectId.isValid(tid)) {
            return res.status(400).json({ message: `Skipping invalid task ID: ${tid}`, data: null });
          }

          const task = await Task.findById(tid);
          if (!task){
            return res.status(404).json({ message: `Task ${tid} does not exist`, data: null });
          }

          // Prevent modifying completed tasks
          if(task.completed){
            return res.status(400).json({ message: 'Completed tasks cannot be modified', data: null });
          }

          // Unassign old user and assign task to new one
          if (task.assignedUser) {
            if (task.assignedUser.toString() !== userId) {
              const oldUser = await User.findById(task.assignedUser);
              if (oldUser) {
                oldUser.pendingTasks = oldUser.pendingTasks.filter(tid2 => tid2.toString() !== tid);
                await oldUser.save();
              }
            }
          }
          task.assignedUser = userId;
          task.assignedUserName = user.name;
          await task.save();

          validTasks.add(tid);
        }

        // console.log('Valid pending tasks for user update:', validTasks);

        // Remove this user from any task no longer pending
        const removed = [...oldPending].filter(x => !validTasks.has(x));
        await Task.updateMany(
          { _id: { $in: removed }, assignedUser: userId },
          { $set: { assignedUser: "", assignedUserName: "unassigned" } }
        );

        user.pendingTasks = [...validTasks];
      }

      const updatedUser = await user.save();

      // ---- If name changed, update assignedUserName in their tasks ----
      if (name !== undefined && name !== oldName) {
        await Task.updateMany(
          { assignedUser: userId },
          { $set: { assignedUserName: name } }
        );
      }

      res.json({ message: 'User updated successfully', data: updatedUser });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: 'Email already exists. Please use a different email.', data: null });
      }
      console.error('Error updating user:', error);
      res.status(400).json({ message: 'Error updating user', data: error.message });
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