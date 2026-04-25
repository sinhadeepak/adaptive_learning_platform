# Bootstrap — prod

Copy [../staging/main.tf](../staging/main.tf) here and flip `env = "prod"`
when the prod AWS account is provisioned. Do **not** run prod bootstrap
from a laptop with elevated privileges — use a dedicated break-glass
session per Security Design §7.
