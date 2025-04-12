const { body } = require("express-validator"); // Import validationResult

exports.documentSchema = [
  body("title").notEmpty().withMessage("title wasn't provided"),
];


