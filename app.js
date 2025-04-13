const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const { logger } = require("./utils/logging");
const cors = require("cors");
const { corsOptions } = require("./conf");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const { models } = require("./models/models");
const PermissionEnum = require("./types/enums/permission-enum");
const { Doc, applyUpdate, encodeStateAsUpdate } = require("yjs");
const { conf, transporter, BUCKET_NAME, s3 } = require("./conf");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const app = express();

app.use(cors(corsOptions));
app.use(helmet()); // secure http headers
app.use(compression()); // compress responses
app.use(express.json()); // parse json bodies
// Parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Enable cookie parsing
app.use(morgan("combined", { stream: logger.stream })); // Log HTTP requests
// Rate limiting

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 100 requests per windowMs
});
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});
app.use(limiter);

const http = require("http");
const socketIoServer = require("socket.io");
const server = http.createServer(app);
const jwt = require("jsonwebtoken");
const io = socketIoServer(server, {
  cors: corsOptions,
  path: "/api/socket",
});

io.use((socket, next) => {
  const Permission = models.Permission;
  try {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.split(" ");
    const documentId = socket.handshake.auth.documentId;
    if (!token) return next(new Error(`Please login first`));
    jwt.verify(token, conf.secret.JWT_SECRET, async (err, decoded) => {
      if (err) return next(new Error("Please login first"));
      socket.user = decoded;
      if (!documentId) return next(new Error("Please provide the documentId"));
      const permission = await Permission.findOne({
        where: {
          userId: socket.user.userId,
          documentId: documentId,
        },
        attributes: ["permissionType"],
      });
      if (!permission)
        return next(new Error("you're not allowed to touch this document"));
      socket.user["permission"] = permission.dataValues.permissionType;
      next();
    });
  } catch (err) {}
});

async function loadYDocFromS3(docId) {
  const params = {
    Bucket: `${BUCKET_NAME}`,
    Key: `${docId}`,
  };
  const response = await s3.send(new GetObjectCommand(params));
  const binary = await response.Body.transformToByteArray();
  const yDoc = new Doc();
  applyUpdate(yDoc, new Uint8Array(binary));
  return yDoc;
}

const documents = new Map(); // mapping between documentId to [document, users]

// Socket.io connection handler
io.on("connection", (socket) => {
  socket.on("join-document", async (documentId) => {
    socket.join(documentId);
    socket.documentId = documentId;

    // Initialize or get existing Yjs document for this room

    if (!documents.has(documentId)) {
      const ydoc = await loadYDocFromS3(documentId);
      documents.set(documentId, [ydoc, new Map()]);
    }

    const [ydoc, users] = documents.get(documentId);
    const user = {
      firstName: socket.user.firstName,
      lastName: socket.user.lastName,
      email: socket.user.email,
      userId: socket.user.userId,
      permission: socket.user.permission,
      color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
    };

    socket.user = user;
    socket.ydoc = ydoc;
    users.set(socket.user.email, user);

    // Send initial document state to client
    const initialUpdate = Array.from(encodeStateAsUpdate(ydoc));
    socket.emit("initial-state", {
      initialUpdate: initialUpdate,
      permission: socket.user.permission,
    });

    io.to(documentId).emit(
      "users",
      Array.from(users).map((innerArray) => innerArray[1])
    );

    // Forward document updates to other clients in the room
    const onUpdate = (update, origin) => {
      if (origin !== socket) {
        // Avoid echo back to sender
        io.to(documentId).emit("yjs-update", Array.from(update));
      }
    };

    ydoc.on("update", onUpdate);

    // Handle client updates
    socket.on("yjs-update", (update) => {
      if (socket.user.permission === "READ") return;
      // Apply update to shared document
      applyUpdate(ydoc, new Uint8Array(update), socket);
    });

    // Handle cursor position updates
    socket.on("cursor-update", (documentId, cursorPos, user) => {
      const document = documents.get(documentId);
      if (!document) return;

      // Broadcast awareness update
      socket.to(documentId).emit("awareness-update", socket.id, {
        user: socket.user,
        cursor: cursorPos,
      });
    });

    socket.on("save", async () => {
      const ydoc = socket.ydoc;
      const yDocState = encodeStateAsUpdate(ydoc);
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `${documentId}`,
        Body: Buffer.from(yDocState),
        ContentType: "application/octet-stream",
      });

      await s3.send(command);
      // fs.writeFileSync(`${documentId}`, Buffer.from(yDocState));
      io.to(documentId).emit("save", {});
    });
    // Cleanup on disconnect
    socket.on("disconnect", () => {
      users.delete(socket.user.email);
      io.to(documentId).emit(
        "users",
        Array.from(users).map((innerArray) => innerArray[1])
      );
      ydoc.off("update", onUpdate);
      // Broadcast awareness update
      socket.to(documentId).emit("awareness-update", socket.id, {
        user: socket.user,
      });
      // Clean up room if empty
      const room = io.sockets.adapter.rooms.get(documentId);
      if (!room || room.size === 0) {
        documents.delete(documentId);
      }
    });
  });
});

module.exports = { server };
