# Automatische opzet van prop firms (D93–D95)

## Wat er gebeurt bij "Firma aanmaken"

Daily Funded (superadmin) vult in het adminpanel (`/{lang}/admin/firms`) naam, code, e-mail van de admin en
optioneel een eigen domein en "eigen database" in. Daarna loopt per firma een pijplijn:

| Stap | Wat | Klaar als |
|---|---|---|
| `TENANT` | voorbeeldcatalogus aanmaken (bij eigen instance: op die instance bij het opstarten) | `CATALOGUE_READY` / `ON_OWN_INSTANCE` |
| `ADMIN` | de ene admin (eigenaar) van de firma bestaat en is uitgenodigd | `ADMIN_INVITED` |
| `DATABASE` | gedeeld (`SHARED`) of eigen database aanmaken, migreren en vullen (`DEDICATED_READY`) | |
| `SUBDOMAIN` | `<slug>.<PLATFORM_BASE_DOMAIN>` werkt via wildcard-DNS | `ACTIVE` |
| `CUSTOM_DOMAIN` | eigen domein gecontroleerd via DNS (TXT + CNAME) | `ACTIVE` |

Stappen die wachten (DNS) of mislukken worden elke minuut opnieuw geprobeerd; in het adminpanel staat per firma
"Opzet" met alle stappen, de DNS-records en "Nu opnieuw uitvoeren". De firma-admin ziet de DNS-instructies
onder Huisstijl.

## Configuratie (gedeeld platform)

```env
PLATFORM_BASE_DOMAIN=dailyfunded.com          # wildcard *.dailyfunded.com → edge
PLATFORM_CNAME_TARGET=tenants.dailyfunded.com # waar eigen domeinen naar wijzen (standaard tenants.<domein>)
DNS_RESOLVER=system
INTERNAL_API_TOKEN=<lange willekeurige waarde>
# Eigen databases (optioneel):
DATABASE_PROVISIONER=postgres
DATABASE_ADMIN_URL=postgresql://provisioner:…@db:5432/postgres   # rol met CREATEDB
```

## Edge-proxy (hosting-onafhankelijk)

De edge stelt twee vragen aan het gedeelde platform, met header `X-Internal-Token`:

- `GET /api/v1/internal/tls/allow?domain=<host>` → `204` = certificaat mag (actief subdomein of geverifieerd
  domein), anders `404`. Voor on-demand TLS.
- `GET /api/v1/internal/route?host=<host>` → `{ "firm": "acme", "instance": "shared" | "dedicated" }` of `404`.
  `dedicated` → doorsturen naar de instance van die firma (bv. upstream `firm-acme:3000`).

Voorbeeld met Caddy (on-demand TLS, alles naar het gedeelde platform; eigen instances krijgen een eigen
site-blok of een routerende proxy ervoor):

```caddyfile
{
  on_demand_tls {
    ask http://api:3000/api/v1/internal/tls/allow
  }
}
https:// {
  tls { on_demand }
  reverse_proxy /api/* api:3000 {
    header_up X-Internal-Token {env.INTERNAL_API_TOKEN}
  }
  reverse_proxy web:80
}
```

## Eigen instance (D94)

1. Firma aanmaken met "Eigen database" → stap `DATABASE` maakt `df_firm_<slug>` aan, migreert, zet de firma en
   eigenaar erin en mailt de eigenaar een link naar `https://<slug>.<platformdomein>`.
2. Configuratie ophalen (bevat het databasegeheim — alleen via de CLI):
   ```bash
   pnpm --filter @brand/api build && pnpm --filter @brand/api firm:instance-env <slug>
   ```
3. Een API + web met die env starten (overige geheimen gelijk aan het platform) en de edge `dedicated`-hosts
   daarheen laten sturen. De instance draait `INSTANCE_MODE=dedicated`: geen provisioning, domein beheerd door
   Daily Funded.
4. Het gedeelde platform weigert verkeer voor deze firma (`421 FIRM_HOSTED_ELSEWHERE`); de superadmin ziet de
   firma in de lijst (status, domein, opzet) maar beheert de inhoud op de eigen instance.

Niet ondersteund: een bestaande firma (met data) naar een eigen database verplaatsen.
