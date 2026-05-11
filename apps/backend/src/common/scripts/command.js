const axios = require('axios');
require('dotenv').config();

const args = process.argv.slice(2);
const commandName = args[0];
const commandArgs = args.slice(1);

if (!commandName) {
  console.error('Please provide a command name.');
  process.exit(1);
}

const baseUrl = 'http://localhost';
const port = process.env.NEST_PORT || 3200;
const url = `${baseUrl}:${port}/api/command/${commandName}`;

const requestBody = {};

commandArgs.forEach((arg) => {
  const [key, value] = arg.split('=');
  const formattedKey = key.replace(/^--/, '');
  requestBody[formattedKey] = value;
});

const headers = {
  'x-command-secret': process.env.COMMAND_SECRET,
};

axios
  .post(url, requestBody, { headers })
  .then((response) => {
    console.log('res:', response.data);
  })
  .catch((error) => {
    console.error('error:', error.response ? error.response.data : error.message);
  });
