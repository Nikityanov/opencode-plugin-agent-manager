import { z } from "zod"

export const modelAssignmentSchema = z
  .object({
    model: z.string().optional(),
    fallback_models: z.unknown().optional(),
  })
  .passthrough()

export type ModelAssignment = z.infer<typeof modelAssignmentSchema>

const assignmentMapSchema = z.record(z.string(), modelAssignmentSchema)

export const ohMyOpenAgentConfigSchema = z
  .object({
    agents: assignmentMapSchema.optional(),
    categories: assignmentMapSchema.optional(),
  })
  .passthrough()

export type OhMyOpenAgentConfig = z.infer<typeof ohMyOpenAgentConfigSchema>

export type ConfigLocation = {
  path: string
  config: OhMyOpenAgentConfig
}

export type ModelOption = {
  readonly value: string
  readonly title: string
}
