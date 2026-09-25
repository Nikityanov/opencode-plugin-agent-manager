import { z } from "zod"

export const modelAssignmentSchema = z
  .object({
    model: z.string().optional(),
    fallback_models: z.unknown().optional(),
  })
  .passthrough()

export type ModelAssignment = z.infer<typeof modelAssignmentSchema>

const assignmentMapSchema = z.record(z.string(), modelAssignmentSchema)

export const ohMyConfigLayerSchema = z
  .object({
    agents: assignmentMapSchema.optional(),
    categories: assignmentMapSchema.optional(),
  })
  .passthrough()

export type OhMyConfigLayer = z.infer<typeof ohMyConfigLayerSchema>

export const ohMyOpenAgentConfigSchema = z
  .object({
    agents: assignmentMapSchema.optional(),
    categories: assignmentMapSchema.optional(),
    "[opencode]": ohMyConfigLayerSchema.optional(),
  })
  .passthrough()

export type OhMyOpenAgentConfig = z.infer<typeof ohMyOpenAgentConfigSchema>

export type ConfigSection = "root" | "opencode"

export type ConfigLocation = {
  path: string
  config: OhMyOpenAgentConfig
  section?: ConfigSection
}

export type ModelOption = {
  readonly value: string
  readonly title: string
}
