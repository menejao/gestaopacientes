import { z } from "zod";

const shortString = (max) => z.string().trim().max(max);
const optionalShortString = (max) => shortString(max).optional();
const optionalDateString = () => z.string().trim().max(50).optional();
const optionalNumberLike = () => z.union([z.string(), z.number()]).optional();

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

const PatientBaseShape = {
  name: z.string().trim().min(1).max(300),
  motherName: optionalShortString(300),
  guardianName: optionalShortString(300),
  phone: z.string().trim().min(1).max(30),
  phoneAlt: optionalShortString(30),
  cpf: optionalShortString(20),
  cns: optionalShortString(30),
  cnsCpf: optionalShortString(30),
  address: optionalShortString(500),
  microArea: optionalShortString(100),
  assignedAcsId: optionalShortString(100),
  teamId: optionalShortString(100),
  careCategory: optionalShortString(100),
  chronicConditions: z.array(z.string().trim().max(100)).max(20).optional(),
  maritalStatus: optionalShortString(50),
  incompleteProfile: z.boolean().optional(),
  sexAtBirth: optionalShortString(50),
  genderIdentity: optionalShortString(80),
  birthDate: optionalDateString(),
  pregnancyStartDate: optionalDateString(),
  expectedDeliveryDate: optionalDateString(),
  gestationalAgeDumWeeks: optionalNumberLike(),
  gestationalAgeDumDays: optionalNumberLike(),
  gestationalAgeUsgWeeks: optionalNumberLike(),
  gestationalAgeUsgDays: optionalNumberLike(),
  usgDate1: optionalDateString(),
  usgDate2: optionalDateString(),
  usgDate3: optionalDateString(),
  prenatalStartDate: optionalDateString(),
  postpartumStartDate: optionalDateString(),
  comorbidities: optionalShortString(4000),
  medications: optionalShortString(4000),
  allergies: optionalShortString(4000)
};

const PatientCreateSchema = z.object(PatientBaseShape);
const PatientUpdateSchema = z.object({
  motherName: optionalShortString(300),
  phone: optionalShortString(30),
  phoneAlt: optionalShortString(30),
  cpf: optionalShortString(20),
  cns: optionalShortString(30),
  cnsCpf: optionalShortString(30),
  address: optionalShortString(500),
  microArea: optionalShortString(100),
  assignedAcsId: optionalShortString(100),
  careCategory: optionalShortString(100),
  chronicConditions: z.array(z.string().trim().max(100)).max(20).optional(),
  maritalStatus: optionalShortString(50),
  incompleteProfile: z.boolean().optional(),
  sexAtBirth: optionalShortString(50),
  genderIdentity: optionalShortString(80),
  birthDate: optionalDateString(),
  pregnancyStartDate: optionalDateString(),
  expectedDeliveryDate: optionalDateString(),
  gestationalAgeDumWeeks: optionalNumberLike(),
  gestationalAgeDumDays: optionalNumberLike(),
  gestationalAgeUsgWeeks: optionalNumberLike(),
  gestationalAgeUsgDays: optionalNumberLike(),
  usgDate1: optionalDateString(),
  usgDate2: optionalDateString(),
  usgDate3: optionalDateString(),
  prenatalStartDate: optionalDateString(),
  postpartumStartDate: optionalDateString(),
  comorbidities: optionalShortString(4000),
  medications: optionalShortString(4000),
  allergies: optionalShortString(4000)
});

const TaskCreateSchema = z.object({
  patientId: z.string().trim().min(1).max(100),
  assigneeId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  notes: optionalShortString(4000),
  status: z.enum(["pending", "in_progress", "done"]).optional(),
  dueDate: optionalDateString()
});

const TaskPatchSchema = z.object({
  status: z.enum(["pending", "in_progress", "done"])
});

const AppointmentCreateSchema = z.object({
  date: z.string().trim().min(1).max(50),
  summary: z.string().trim().min(1).max(10000),
  demandType: optionalShortString(40),
  conduct: optionalShortString(4000),
  nextStep: optionalShortString(4000)
});

const RecordCreateSchema = z.object({
  type: z.enum(["visit", "consultation", "vaccine", "procedure", "note"]),
  date: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(500),
  details: optionalShortString(20000),
  protocolTag: optionalShortString(100),
  metadata: z.record(z.any()).optional()
});

const PrivacyRequestCreateSchema = z.object({
  patientId: z.string().min(1).max(100),
  type: z.enum(["access", "correction", "deletion"])
});

const MePatchSchema = z.object({
  name: optionalShortString(200),
  email: optionalShortString(255),
  password: z.string().max(1024).optional(),
  currentPassword: z.string().max(1024).optional(),
  councilNumber: optionalShortString(30),
  councilUf: optionalShortString(2)
});

const ImpersonationStartSchema = z.object({
  targetUserId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(8).max(500)
});

const BreakGlassSchema = z.object({
  reason: z.string().trim().min(8).max(500)
});

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
  MePatchSchema,
  ImpersonationStartSchema,
  BreakGlassSchema,
  validate
};
