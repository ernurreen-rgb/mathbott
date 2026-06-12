import type { LessonTaskOption, LessonTaskSubquestion, QuestionType } from "./curriculum";


// Bank tasks (admin pool for trial tests)
export type BankDifficulty = "A" | "B" | "C";

export type TaskTextScale = "sm" | "md" | "lg";


export interface BankTask {
  id: number;
  text: string;
  answer: string;
  question_type: QuestionType;
  text_scale?: TaskTextScale | null;
  options?: LessonTaskOption[] | null;
  subquestions?: LessonTaskSubquestion[] | null;
  image_filename?: string | null;
  solution_filename?: string | null;
  difficulty: BankDifficulty;
  topics: string[];
  created_by?: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  current_version?: number;
  active_usage_count?: number;
}


export interface BankTaskListResponse {
  items: BankTask[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}


export interface BankQualitySummaryResponse {
  active_total: number;
  dead_total: number;
  no_topics_total: number;
  default_similarity_threshold: number;
}


export interface BankQualityListParams {
  search?: string;
  difficulty?: BankDifficulty | "";
  limit?: number;
  offset?: number;
}


export interface BankDuplicateListParams extends BankQualityListParams {
  threshold?: number;
  question_type?: QuestionType | "";
}


export interface BankDuplicateMember {
  id: number;
  text: string;
  question_type: QuestionType;
  difficulty: BankDifficulty;
  topics: string[];
  active_usage_count: number;
  updated_at: string;
  current_version: number;
  best_match_score: number;
}


export interface BankDuplicateCluster {
  cluster_id: string;
  size: number;
  max_score: number;
  members: BankDuplicateMember[];
}


export interface BankDuplicateListResponse {
  threshold: number;
  items: BankDuplicateCluster[];
  total_clusters: number;
  total_tasks_in_clusters: number;
  limit: number;
  offset: number;
  has_more: boolean;
}


export type BankAuditAction =
  | "import_confirm"
  | "version_delete"
  | "rollback"
  | "hard_delete"
  | "role_change";


export interface BankAuditLogItem {
  id: number;
  domain: "bank";
  action: BankAuditAction;
  entity_type: "bank_task" | "bank_import_batch" | "admin_user";
  entity_id: number | null;
  actor_user_id: number | null;
  actor_email: string;
  summary: string;
  changed_fields: string[];
  metadata: Record<string, any>;
  created_at: string;
}


export interface BankAuditListParams {
  action?: BankAuditAction | "";
  task_id?: number;
  actor_email?: string;
  limit?: number;
  offset?: number;
}


export interface BankAuditListResponse {
  items: BankAuditLogItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}


export interface TrialTestAddFromBankResponse {
  added_count: number;
  skipped_existing_ids: number[];
  created_task_ids: number[];
  skipped_missing_ids?: number[];
}


export interface BankTaskVersionItem {
  id: number;
  bank_task_id: number;
  version_no: number;
  event_type: string;
  source?: string | null;
  actor_user_id?: number | null;
  reason?: string | null;
  rollback_from_version?: number | null;
  changed_fields: string[];
  created_at: string;
}


export interface BankTaskVersionDetail extends BankTaskVersionItem {
  snapshot: {
    text: string;
    answer: string;
    question_type: QuestionType;
    text_scale?: TaskTextScale | null;
    options?: LessonTaskOption[] | null;
    subquestions?: LessonTaskSubquestion[] | null;
    difficulty?: BankDifficulty | null;
    topics?: string[];
    image_filename?: string | null;
    solution_filename?: string | null;
  };
}


export interface BankTaskVersionListResponse {
  items: BankTaskVersionItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}


export interface BankTaskUsageItem {
  kind: "module" | "trial_test";
  placement_id: number;
  sort_order: number;
  deleted_at?: string | null;
  module_id?: number | null;
  module_name?: string | null;
  section_id?: number | null;
  section_name?: string | null;
  lesson_id?: number | null;
  lesson_title?: string | null;
  lesson_number?: number | null;
  mini_lesson_id?: number | null;
  mini_lesson_title?: string | null;
  mini_index?: number | null;
  trial_test_id?: number | null;
  trial_test_title?: string | null;
}


export interface BankTaskUsageResponse {
  task_id: number;
  active_only: boolean;
  total: number;
  items: BankTaskUsageItem[];
}


export interface BankTaskSimilarCandidate {
  id: number;
  text: string;
  question_type: QuestionType;
  difficulty: BankDifficulty;
  score: number;
  updated_at: string;
}


export type BankImportMode = "dry_run" | "confirm";


export interface BankImportDuplicateConflictItem {
  index: number;
  similar_tasks: BankTaskSimilarCandidate[];
}


export interface SimilarConflictPayload {
  code: "SIMILAR_TASKS_FOUND";
  message: string;
  task_index?: number;
  similar_tasks: BankTaskSimilarCandidate[];
  conflicts?: BankImportDuplicateConflictItem[];
}


export interface BankImportValidationErrorItem {
  index: number;
  field: string;
  message: string;
}


export interface BankImportValidationErrorPayload {
  code: "IMPORT_VALIDATION_FAILED";
  errors: BankImportValidationErrorItem[];
}


export interface BankImportResponse {
  mode?: "confirm";
  created_count: number;
  created_ids: number[];
}


export interface BankImportPreviewSummary {
  total_tasks: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  can_confirm: boolean;
  requires_dedup_confirmation: boolean;
}


export interface BankImportPreviewResponse {
  mode: "dry_run";
  preview_token: string;
  expires_at: string;
  summary: BankImportPreviewSummary;
  validation_errors: BankImportValidationErrorItem[];
  duplicate_conflicts: BankImportDuplicateConflictItem[];
}


export interface BankPlacementTask {
  id: number;
  trial_test_id?: number;
  section_id?: number | null;
  mini_lesson_id?: number | null;
  bank_task_id: number | null;
  sort_order: number;
  deleted_at?: string | null;
  task_type?: string | null;
  bank_difficulty?: BankDifficulty | null;
  bank_topics?: string[];
  bank_task?: Partial<BankTask> | null;
  text?: string;
  answer?: string;
  question_type?: QuestionType;
  text_scale?: TaskTextScale | null;
  options?: LessonTaskOption[] | null;
  subquestions?: LessonTaskSubquestion[] | null;
  image_filename?: string | null;
}
