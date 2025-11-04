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
    const { name, description, deadline, completed = false, assignedUser } = req.body;

    if (!name || !deadline) {
      return res.status(400).json({ message: 'Missing required fields: name and deadline', data: null });
    }

    let assignedUserName = "unassigned";
    let validUser = null;

    // Validate assigned user and set name correctly
    if (assignedUser) {
      validUser = await User.findById(assignedUser);
      if (!validUser) {
        return res.status(400).json({ message: 'Assigned user not found', data: null });
      }
      assignedUserName = validUser.name;
    }

    const task = new Task({
      name,
      description,
      deadline,
      completed,
      assignedUser: validUser ? validUser._id.toString() : "",
      assignedUserName,
    });

    const savedTask = await task.save();

    // Add to user's pendingTasks only if not completed
    if (validUser && !completed) {
      validUser.pendingTasks.push(savedTask._id.toString());
      await validUser.save();
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
  // PUT /tasks/:id → Replace task with validation and user sync
  // ----------------------------------------------------------
  tasksRouteById.put(async (req, res) => {
    try {
      const taskId = req.params.taskId;
      const { name, description, deadline, completed, assignedUser, assignedUserName } = req.body;

      const task = await Task.findById(taskId).exec();
      if (!task) {
        return res.status(404).json({ message: 'Task not found', data: null });
      }

      // Prevent changing _id
      if (req.body._id && req.body._id !== taskId) {
        return res.status(400).json({ message: 'Task ID cannot be modified', data: null });
      }

      // Flags
      const hasAssignedUserField = Object.prototype.hasOwnProperty.call(req.body, 'assignedUser');
      const hasAssignedUserNameField = Object.prototype.hasOwnProperty.call(req.body, 'assignedUserName');
      const isCompletedChanged = typeof completed === 'boolean' && completed !== task.completed;

      let isUserChanged = false;
      let newAssignedUser = null;

      // ---- Handle reassignment if explicitly passed ----
      if (hasAssignedUserField) {
        const newUserId = (assignedUser || "").toString();
        const oldUserId = (task.assignedUser || "").toString();

        if (newUserId !== oldUserId) {
          isUserChanged = true;

          // Remove from old user's pendingTasks
          if (oldUserId) {
            const oldUser = await User.findById(oldUserId);
            if (oldUser) {
              oldUser.pendingTasks = oldUser.pendingTasks.filter(id => id !== task._id.toString());
              await oldUser.save();
            }
          }

          // Handle unassignment
          if (!newUserId) {
            task.assignedUser = "";
            task.assignedUserName = "unassigned";
          } else {
            newAssignedUser = await User.findById(newUserId);
            if (!newAssignedUser) {
              return res.status(400).json({ message: 'Assigned user not found', data: null });
            }

            if (hasAssignedUserNameField && newAssignedUser.name !== assignedUserName) {
              return res.status(400).json({
                message: `assignedUserName does not match user's actual name (${newAssignedUser.name})`,
                data: null
              });
            }

            task.assignedUser = newUserId;
            task.assignedUserName = hasAssignedUserNameField ? assignedUserName : newAssignedUser.name;
          }
        }
      }

      // ---- Update other editable fields ----
      if (name !== undefined) task.name = name;
      if (description !== undefined) task.description = description;
      if (deadline !== undefined) task.deadline = deadline;
      if (typeof completed === 'boolean') task.completed = completed;

      const updatedTask = await task.save();

      // ---- Maintain pendingTasks consistency ----
      if (isUserChanged && newAssignedUser) {
        // Only add if not completed
        if (!updatedTask.completed && !newAssignedUser.pendingTasks.includes(taskId)) {
          newAssignedUser.pendingTasks.push(taskId);
          await newAssignedUser.save();
        }
      } 
      // ensure pendingTasks consistency even if user didn’t "change"
      else if (!isUserChanged && updatedTask.assignedUser && !updatedTask.completed) {
        const currentUser = await User.findById(updatedTask.assignedUser);
        if (currentUser && !currentUser.pendingTasks.includes(taskId)) {
          currentUser.pendingTasks.push(taskId);
          await currentUser.save();
        }
      }

      // If task is marked complete, remove from pendingTasks
      if (isCompletedChanged && updatedTask.completed && task.assignedUser) {
        const assigned = await User.findById(task.assignedUser);
        if (assigned) {
          assigned.pendingTasks = assigned.pendingTasks.filter(id => id !== task._id.toString());
          await assigned.save();
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