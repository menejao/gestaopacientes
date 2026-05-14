import { z } from "zod";

const LoginSchema = z.object({
  email: z.string().min(1).max(255),
  password: z.string().min(1).max(1024)
});

const RegisterSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().min(1).max(255),
  password: z.string().min(1).max(1024),
  role: z.string().min(1).max(50),
  teamId: z.string().max(100).optional(),
  councilNumber: z.string().max(30).optional(),
  councilUf: z.string().max(2).optional()
});

const PatientCreateSchema = z.object({
  name: z.string().min(1).max(300),
  phone: z.string().min(1).max(30)
}).passthrough();

const PatientUpdateSchema = z.object({}).passthrough();

const TaskCreateSchema = z.object({
  patientId: z.string().min(1).max(100),
  assigneeId: z.string().min(1).max(100),
  title: z.string().min(1).max(500)
}).passthrough();

const TaskPatchSchema = z.object({
  status: z.string().min(1).max(50)
}).passthrough();

const AppointmentCreateSchema = z.object({
  date: z.string().min(1).max(50),
  summary: z.string().min(1).max(10000)
}).passthrough();

const RecordCreateSchema = z.object({
  type: z.enum(["visit", "consultation", "vaccine", "procedure", "note"]),
  date: z.string().min(1).max(50),
  title: z.string().min(1).max(500)
}).passthrough();

const PrivacyRequestCreateSchema = z.object({
  patientId: z.string().min(1).max(100),
  type: z.enum(["access", "correction", "deletion"])
}).passthrough();

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      return res.status(400).json({
        error: "Dados inválidos",
        details: result.error.issues.map((i) => {
          const path = i.path.length ? i.path.join(".") : "body";
          return `${path}: ${i.message}`;
        })
      });
    }
    req.body = result.data;
    next();
  };
}

export {
  LoginSchema,
  RegisterSchema,
  PatientCreateSchema,
  PatientUpdateSchema,
  TaskCreateSchema,
  TaskPatchSchema,
  AppointmentCreateSchema,
  RecordCreateSchema,
  PrivacyRequestCreateSchema,
  validate
};
