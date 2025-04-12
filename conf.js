const nodemailer = require("nodemailer");
require("dotenv").config();
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

const BUCKET_NAME = "editor-documents-bucket"; // Replace with your bucket
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const s3 = new S3Client({ region: "eu-north-1" });

const conf = { secret: null };
const transporter = { transporter: null };
const corsOptions = {
  origin: null, // Your frontend origin
  credentials: true, // Required for cookies, authorization headers
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
const secretsClient = new SecretsManagerClient({
  region: "eu-north-1",
});

async function getConfiguration() {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: process.env.KEYS_SECRET_ARN,
      })
    );

    if (!response.SecretString) {
      throw new Error("Secret string is empty");
    }

    const secret = JSON.parse(response.SecretString);
    conf.secret = secret;
    transporter.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: conf.secret.EMAIL_USER,
        pass: conf.secret.EMAIL_PASS,
      },
    });
    corsOptions.origin = conf.secret.FRONTEND_URL;
  } catch (error) {
    console.error("Failed to retrieve KEYS secret:", error);
  }
}
getConfiguration();

module.exports = { transporter, conf, corsOptions, BUCKET_NAME, s3 };
