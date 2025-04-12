const { Sequelize } = require("sequelize");
const { logger } = require("./utils/logging");
require("dotenv").config();

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

// Initialize Secrets Manager client
const secretsClient = new SecretsManagerClient({
  region: "eu-north-1",
});

async function getDatabaseSecret() {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: process.env.DB_SECRET_ARN,
      })
    );

    if (!response.SecretString) {
      throw new Error("Secret string is empty");
    }

    const secret = JSON.parse(response.SecretString);
    return secret;
  } catch (error) {
    console.error("Failed to retrieve database secret:", error);
    // throw error;
  }
}

let sequelize;
async function initializeDatabase() {
  try {
    const secret = await getDatabaseSecret();
    sequelize = new Sequelize({
      database: secret.dbname,
      username: secret.username,
      password: secret.password,
      host: secret.host,
      port: secret.port,
      dialect: "postgres",
      loggin: console.log,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },

      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      },
      retry: {
        max: 3,
        timeout: 10000,
        match: [
          /ConnectionError/,
          /SequelizeConnectionError/,
          /ECONNREFUSED/,
          /ETIMEDOUT/,
          /TimeoutError/,
        ],
      },
    });
    return sequelize;
  } catch (error) {
    console.log(error);
  }
}

function getSequelize() {
  return sequelize;
}

module.exports = { getSequelize, initializeDatabase };
