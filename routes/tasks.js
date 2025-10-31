const User = require('../models/user');
const Task = require('../models/task');

module.exports = function (router) {

  var tasksRoute = router.route('/tasks');
  var tasksRouteById = router.route('/tasks/:taskId');

  // ----------------------------------------------------------
  // POST /tasks → Create a new task
  // ----------------------------------------------------------
  tasksRoute.post(async function (req, res) {
    try {
      const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body;

      // Validation
      if (!name) {
        return res.status(400).json({ message: 'Missing required field: name' });
      }

      const task = new Task({
        name,
        description,
        deadline,
        completed: completed || false,
        assignedUser: assignedUser || "",
        assignedUserName: assignedUserName || "unassigned",
        dateCreated: new Date()
      });

      const savedTask = await task.save();

      // If assigned to a valid user, update their pendingTasks
      if (assignedUser) {
        const user = await User.findById(assignedUser);
        if (user) {
          user.pendingTasks.push(savedTask._id.toString());
          await user.save();
        }
      }

      res.status(201).json({ message: 'Task created!', data: savedTask });
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ message: 'Error creating task', error: error.message });
    }
  });

  // ----------------------------------------------------------
  // GET /tasks → Get all tasks
  // ----------------------------------------------------------
  tasksRoute.get(async function (req, res) {
    try {
      const tasks = await Task.find();
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ message: 'Error fetching tasks', error: error.message });
    }
  });

  // ----------------------------------------------------------
  // GET /tasks/:taskId → Get details of a specific task
  // ----------------------------------------------------------
  tasksRouteById.get(async function (req, res) {
    try {
      const taskId = req.params.taskId;
      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      res.json(task);
    } catch (error) {
      console.error('Error fetching task details:', error);
      res.status(500).json({ message: 'Error fetching task details', error: error.message });
    }
  });

  // ----------------------------------------------------------
  // PUT /tasks/:taskId → Replace entire task
  // ----------------------------------------------------------
  tasksRouteById.put(async function (req, res) {
    try {
      const taskId = req.params.taskId;
      const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body;

      // Validation: name is required
      if (!name) {
        return res.status(400).json({ message: 'Missing required field: name' });
      }

      const existingTask = await Task.findById(taskId);
      if (!existingTask) {
        return res.status(404).json({ message: 'Task not found' });
      }

      // If reassigned, remove from old user’s pendingTasks
      if (existingTask.assignedUser && existingTask.assignedUser !== assignedUser) {
        const oldUser = await User.findById(existingTask.assignedUser);
        if (oldUser) {
          oldUser.pendingTasks = oldUser.pendingTasks.filter(id => id !== existingTask._id.toString());
          await oldUser.save();
        }
      }

      // Update the task
      existingTask.name = name;
      existingTask.description = description;
      existingTask.deadline = deadline;
      existingTask.completed = completed || false;
      existingTask.assignedUser = assignedUser || "";
      existingTask.assignedUserName = assignedUserName || "unassigned";

      const updatedTask = await existingTask.save();

      // If newly assigned, add to new user’s pendingTasks
      if (assignedUser) {
        const newUser = await User.findById(assignedUser);
        if (newUser && !newUser.pendingTasks.includes(updatedTask._id.toString())) {
          newUser.pendingTasks.push(updatedTask._id.toString());
          await newUser.save();
        }
      }

      res.json(updatedTask);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(400).json({ message: 'Error updating task', error: error.message });
    }
  });

  // ----------------------------------------------------------
  // DELETE /tasks/:taskId → Delete task
  // ----------------------------------------------------------
  tasksRouteById.delete(async function (req, res) {
    try {
      const taskId = req.params.taskId;
      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      // Remove task reference from user’s pendingTasks
      if (task.assignedUser) {
        const user = await User.findById(task.assignedUser);
        if (user) {
          user.pendingTasks = user.pendingTasks.filter(id => id !== task._id.toString());
          await user.save();
        }
      }

      await task.deleteOne();
      res.json({ message: 'Task deleted successfully', data: task });
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ message: 'Error deleting task', error: error.message });
    }
  });

  return router;
};
