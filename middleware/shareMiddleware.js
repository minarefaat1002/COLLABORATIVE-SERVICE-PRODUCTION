const { body } = require("express-validator"); // Import validationResult
const PermissionEnum = require("../types/enums/permission-enum");

module.exports.shareSchema = [
  body("email")
    .isEmail()
    .withMessage("Must provide a valid email to share this document with.")
    .normalizeEmail()
    ,
  body("permission").custom((value) => {
    if (!Object.values(PermissionEnum).includes(value))
      throw new Error("Must provide a valid document permisson.");
    else return true;
  }),
];
