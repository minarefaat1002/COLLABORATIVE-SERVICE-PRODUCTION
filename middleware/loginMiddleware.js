const { body } = require("express-validator"); // Import validationResult

// Schema for user registration
module.exports.loginSchema = [
  body("email")
    .notEmpty()
    .escape()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  // Password validation
  body("password").escape(),
];
