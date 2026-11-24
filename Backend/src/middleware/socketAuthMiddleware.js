import jwt from "jsonwebtoken";
import User from "../models/user.js";

export const authenticateSocket = async (socket, next) => {
  try {
    const authHeader = socket.handshake.headers?.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : null;

    const token = socket.handshake.auth?.token || bearerToken;

    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: ["id", "name", "email", "isVerified"],
    });

    if (!user || !user.isVerified) {
      return next(new Error("Authentication error: User not authorized"));
    }

    socket.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    next();
  } catch (error) {
    next(new Error("Authentication error: Invalid or expired token"));
  }
};
