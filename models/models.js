const { DataTypes } = require("sequelize");
const { getSequelize } = require("../db");
const bcrypt = require("bcryptjs");
const models = {};

function initializeModels() {
  const sequelize = getSequelize();
  User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      firstName: {
        type: DataTypes.STRING,
        validate: {
          max: 150,
        },
        allowNull: false,
      },
      lastName: {
        type: DataTypes.STRING,
        validate: {
          max: 150,
        },
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        max: 150,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true, // allow null for social login users
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      googleId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      facebookId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      // other model options
    }
  );

  // Hash password before saving
  User.beforeSave(async (user) => {
    if (user.changed("password")) {
      user.password = await bcrypt.hash(user.password, 10);
    }
  });

  // the documents model in the database
  Document = sequelize.define("Document", {
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });

  User.hasMany(Document, { foreignKey: "userId" });
  Document.belongsTo(User, { foreignKey: "userId" });

  // the permission table in the database
  Permission = sequelize.define(
    "Permission",
    {
      userId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
      documentId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        references: {
          model: "Documents",
          key: "id",
        },
      },
      permissionType: {
        type: DataTypes.ENUM("READ", "WRITE", "OWNER"),
        allowNull: false,
      },
    },
    {
      indexes: [
        {
          unique: false,
          fields: ["userId"],
        },
        {
          unique: false,
          fields: ["documentId"],
        },
      ],
    }
  );

  Permission.belongsTo(User, { foreignKey: "userId" });
  Permission.belongsTo(Document, { foreignKey: "documentId" });

  models.User = User;
  models.Document = Document;
  models.Permission = Permission;

  // Sync models (handled in server.js)
  async function syncModels() {
    await User.sync({ alter: false }); // Don't use alter in production
    await Document.sync({ alter: false });
    await Permission.sync({ alter: false });
    console.log("Models synchronized");
  }
  syncModels();
}
module.exports = {
  initializeModels,
  models,
};
