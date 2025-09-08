const { createLogger, format, transports } = require('winston');
const path = require('path');

const logger = createLogger({
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: path.join('logs', 'error.log'), level: 'error' }),
    new transports.File({ filename: path.join('logs', 'api.log') }),
  ],
});

module.exports = logger;
