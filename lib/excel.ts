import ExcelJS from "exceljs";
import { getApplicationLogs, getJobs, getUserProfile } from "./db";

/**
 * Export job data to an Excel file matching the "2026 Job Bid List" template.
 * Columns: No, Date, Job Title, Company, Stack, Bid Name, Salary Range, Site Link
 */
export async function exportToExcel(userId: string): Promise<Buffer> {
  const jobs = await getJobs(userId, undefined, 1000);
  const profile = await getUserProfile(userId);
  const bidName = profile.fullName || "—";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Job App Automation";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("2026 Job Bid List", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Define columns to match the template
  sheet.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Date", key: "date", width: 14 },
    { header: "Job Title", key: "jobTitle", width: 42 },
    { header: "Company", key: "company", width: 30 },
    { header: "Stack", key: "stack", width: 30 },
    { header: "Bid Name", key: "bidName", width: 20 },
    { header: "Salary Range", key: "salary", width: 18 },
    { header: "Site Link", key: "siteLink", width: 40 },
  ];

  // Style header row — dark background, white bold text
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2D2D2D" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 26;

  // Add data rows
  let rowNum = 0;
  for (const job of jobs) {
    rowNum++;
    const dateStr = job.scrapedAt ? job.scrapedAt.slice(0, 10) : "";

    // Extract stack/skills from description keywords or source
    const stack = extractStack(job.description, job.title);

    const row = sheet.addRow({
      no: rowNum,
      date: dateStr,
      jobTitle: job.title,
      company: job.company,
      stack: stack,
      bidName: bidName,
      salary: job.salary || "",
      siteLink: job.url,
    });

    // Make company and site link clickable
    if (job.url) {
      const linkCell = row.getCell("siteLink");
      linkCell.value = { text: job.url, hyperlink: job.url };
      linkCell.font = { color: { argb: "FF1155CC" }, underline: true, size: 10 };
    }

    // Style the company cell as green link if URL exists
    const companyCell = row.getCell("company");
    if (job.url) {
      companyCell.value = { text: job.company, hyperlink: job.url };
      companyCell.font = { color: { argb: "FF0B8043" }, underline: true, size: 10 };
    }
  }

  // Auto-filter on all columns
  if (rowNum > 0) {
    sheet.autoFilter = {
      from: "A1",
      to: `H${rowNum + 1}`,
    };
  }

  // Alternate row shading + borders
  for (let i = 2; i <= rowNum + 1; i++) {
    const row = sheet.getRow(i);
    row.alignment = { vertical: "middle" };
    row.font = row.font ?? { size: 10 };

    if (i % 2 === 0) {
      row.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
      };
    }

    // Light borders
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  }

  // Stack column — add data validation dropdown feel (just style, no real dropdown in file)
  // Bid Name column — light style
  for (let i = 2; i <= rowNum + 1; i++) {
    const stackCell = sheet.getRow(i).getCell("stack");
    if (stackCell.value) {
      stackCell.font = { size: 10 };
    }
    const bidCell = sheet.getRow(i).getCell("bidName");
    bidCell.font = { size: 10 };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Extract tech stack keywords from job title + description.
 */
function extractStack(description: string, title: string): string {
  const text = `${title} ${description}`.toLowerCase();
  const techKeywords = [
    "Java", "Python", "C#", "Go", "Rust", "Ruby", "PHP", "Swift", "Kotlin",
    "JavaScript", "TypeScript", "React", "Angular", "Vue", "Next.js", "Node.js",
    "ASP.NET", ".NET", "AWS", "Azure", "GCP", "Docker", "Kubernetes",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "GraphQL", "REST",
    "Terraform", "CI/CD", "React Native", "Flutter", "iOS", "Android",
  ];

  const found = techKeywords.filter((kw) => text.includes(kw.toLowerCase()));
  // Deduplicate and limit
  const unique = [...new Set(found)];
  return unique.slice(0, 6).join("   ");
}
