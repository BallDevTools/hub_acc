import { Prisma } from "@hub/db";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "not_found", "ไม่พบข้อมูล");

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  }
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "validation_error",
      message: "ข้อมูลไม่ถูกต้อง",
      details: error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
    });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return reply.status(409).send({ error: "conflict", message: "มีข้อมูลนี้อยู่แล้ว" });
    }
    if (error.code === "P2003") {
      return reply.status(409).send({
        error: "in_use",
        message: "ทำรายการไม่ได้ เพราะยังมีข้อมูลอื่นเชื่อมอยู่ หรือข้อมูลที่อ้างถึงไม่มีอยู่",
      });
    }
    if (error.code === "P2025") {
      return reply.status(404).send({ error: "not_found", message: "ไม่พบข้อมูล" });
    }
  }
  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  if (statusCode && statusCode < 500) {
    return reply.status(statusCode).send({ error: "bad_request", message: "คำขอไม่ถูกต้อง" });
  }
  request.log.error({ err: error }, "unhandled error");
  return reply.status(500).send({ error: "internal_error", message: "เกิดข้อผิดพลาดในระบบ" });
}
