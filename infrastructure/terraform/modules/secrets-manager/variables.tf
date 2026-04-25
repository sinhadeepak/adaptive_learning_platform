variable "project" { type = string }
variable "env" { type = string }

variable "services" {
  type    = list(string)
  default = [
    "auth", "user-profile", "content", "catalog", "search",
    "analytics", "payment", "institution", "notification",
    "adaptive-engine", "quiz",
  ]
}
