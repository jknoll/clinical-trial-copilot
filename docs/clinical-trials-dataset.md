ClinicalTrials.gov Data Availability
Total Size

530,000+ total studies as of early 2025 Nih, likely approaching 550K+ by now
The AACT database contains more than 40 relations, each having millions of records GitHub

Three Access Methods
1. Bulk XML Download (full dump)

A single zip file containing all study records (registration info + results) in XML format is available Dr-haoliu. One XML file per study, organized into subdirectories.
The zip is typically ~2-3 GB compressed, expanding to ~15-20 GB of XML files. (The exact size isn't published on a live page I can cite, but this is consistent with community reports for 500K+ studies.)

2. AACT PostgreSQL Database (recommended for your use case)

AACT is a publicly available relational database containing all information (protocol and result data elements) about every study registered in ClinicalTrials.gov, refreshed daily LinkedIn
Available as a PostgreSQL dump file for local restore, or as pipe-delimited text files for import into any tool Ctti-clinicaltrials
You can also connect directly to a cloud-hosted AACT database using psql Ctti-clinicaltrials — free account required
The pg_dump is roughly 7-10 GB, the flat files are similar
Full data dictionary and entity-relationship schema are provided Pharmasug

3. ClinicalTrials.gov API v2 (what the spec uses)

Free, no auth, JSON responses, 10 req/sec rate limit
Supports field-level selection, geographic filtering, condition/intervention search
Returns paginated results up to 1,000 per page
This is the best approach for the hackathon — no need to download the full dataset. The agent queries the API in real-time based on the patient's condition/location.

Practical Implications for the Project
You don't need the bulk download. The spec already uses the API correctly — the agent searches for a specific condition + location, which returns maybe 50-500 matching trials, not 530K. The bulk download would only matter if you wanted to do aggregate analytics (e.g., "how many Phase 3 oncology trials are recruiting nationwide?"), which is a nice-to-have visualization but not core to the patient-facing flow.
If you did want to pre-load aggregate stats for the visualization layer (demographic trends, phase distributions by condition), the AACT cloud database is the move — you can run SQL queries against it directly without downloading anything, just with a free account and psql.