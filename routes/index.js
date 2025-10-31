/*
 * Connect all of your endpoints together here.
 */
module.exports = function (app, router) {
    app.use('/api', require('./users')(router));
    app.use('/api', require('./tasks')(router));
    app.use('/api', require('./home.js')(router));
};
