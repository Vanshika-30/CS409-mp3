const User = require('../models/user');
const Task = require('../models/task');

module.exports = function (router) {
  const tasksRoute = router.route('/tasks');
  const tasksRouteById = router.route('/tasks/:taskId');

  const parseJSON = (input, defaultValue) => {
    try {
      return input ? JSON.parse(input) : defaultValue;
    } catch {
      return defaultValue;
    }
  };

  // ----------------------------------------------------------
  // POST /tasks → Create new task
  // ----------------------------------------------------------
  tasksRoute.post(async (req, res) => {
    try {
      const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body;
      if (!name || !deadline) {
        return res.status(400).json({ message: 'Missing required fields: name and deadline', data: null });
      }

      const task = new Task({
        name,
        description,
        deadline,
        completed: completed || false,
        assignedUser: assignedUser || "",
        assignedUserName: assignedUserName || "unassigned"
      });

      const savedTask = await task.save();

      if (assignedUser) {
        const user = await User.findById(assignedUser);
        if (user) {
          user.pendingTasks.push(savedTask._id.toString());
          await user.save();
        }
      }

      res.status(201).json({ message: 'Task created successfully', data: savedTask });
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ message: 'Error creating task', data: null });
    }
  });

  // ----------------------------------------------------------
  // GET /tasks → List tasks (with query parameters)
  // ----------------------------------------------------------
  tasksRoute.get(async (req, res) => {
    try {
      const where = parseJSON(req.query.where, {});
      const sort = parseJSON(req.query.sort, {});
      const select = parseJSON(req.query.select, {});
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 100;
      const count = req.query.count === 'true';

      if (count) {
        const total = await Task.countDocuments(where);
        return res.json({ message: 'OK', data: { count: total } });
      }

      const tasks = await Task.find(where)
        .sort(sort)
        .select(select)
        .skip(skip)
        .limit(limit)
        .exec();

      res.json({ message: 'OK', data: tasks });
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ message: 'Error fetching tasks', data: null });
    }
  });

  // ----------------------------------------------------------
  // GET /tasks/:id → Get specific task
  // ----------------------------------------------------------
  tasksRouteById.get(async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const select = parseJSON(req.query.select, {});
      const task = await Task.findById(taskId).select(select).exec();
      if (!task) return res.status(404).json({ message: 'Task not found', data: null });
      res.json({ message: 'OK', data: task });
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({ message: 'Error fetching task', data: null });
    }
  });

  // ----------------------------------------------------------
  // PUT /tasks/:id → Replace task
  // ----------------------------------------------------------
  tasksRouteById.put(async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body;
      if (!name || !deadline) {
        return res.status(400).json({ message: 'Missing required fields: name and deadline', data: null });
      }

      const task = await Task.findById(taskId).exec();
      if (!task) return res.status(404).json({ message: 'Task not found', data: null });

      // Handle unassignment from old user
      if (task.assignedUser && task.assignedUser !== assignedUser) {
        const oldUser = await User.findById(task.assignedUser);
        if (oldUser) {
          oldUser.pendingTasks = oldUser.pendingTasks.filter(id => id !== task._id.toString());
          await oldUser.save();
        }
      }

      // Update fields
      task.name = name;
      task.description = description;
      task.deadline = deadline;
      task.completed = completed || false;
      task.assignedUser = assignedUser || "";
      task.assignedUserName = assignedUserName || "unassigned";

      const updatedTask = await task.save();

      // Add to new user
      if (assignedUser) {
        const newUser = await User.findById(assignedUser);
        if (newUser && !newUser.pendingTasks.includes(taskId)) {
          newUser.pendingTasks.push(taskId);
          await newUser.save();
        }
      }

      res.json({ message: 'Task updated successfully', data: updatedTask });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(400).json({ message: 'Error updating task', data: null });
    }
  });

  // ----------------------------------------------------------
  // DELETE /tasks/:id → Delete a task
  // ----------------------------------------------------------
  tasksRouteById.delete(async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const task = await Task.findById(taskId).exec();
      if (!task) return res.status(404).json({ message: 'Task not found', data: null });

      if (task.assignedUser) {
        const user = await User.findById(task.assignedUser);
        if (user) {
          user.pendingTasks = user.pendingTasks.filter(id => id !== task._id.toString());
          await user.save();
        }
      }

      await task.deleteOne();
      res.status(204).json({ message: 'Task deleted successfully', data: task });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ message: 'Error deleting task', data: null });
    }
  });

  return router;
};
