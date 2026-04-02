import "dotenv/config";
import { db } from "./db.js";
import { hashPassword } from "./auth.js";

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  const orgName = (process.env.DEFAULT_ORG_NAME || "Destiny Springs Healthcare").trim();
  const ownerEmail = (process.env.DEFAULT_OWNER_EMAIL || "owner@nyxarete.com").trim().toLowerCase();
  const ownerPassword = (process.env.DEFAULT_OWNER_PASSWORD || "ChangeMeNow123!").trim();
  const slug = slugify(orgName);

  const org = await db.organization.upsert({
    where: { slug },
    update: { name: orgName },
    create: {
      name: orgName,
      slug,
    },
  });

  const passwordHash = await hashPassword(ownerPassword);

  await db.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: ownerEmail,
      },
    },
    update: {
      fullName: "NyxArete Owner",
      passwordHash,
      role: "OWNER",
    },
    create: {
      organizationId: org.id,
      email: ownerEmail,
      fullName: "NyxArete Owner",
      passwordHash,
      role: "OWNER",
    },
  });

  await db.course.upsert({
    where: {
      organizationId_code_version: {
        organizationId: org.id,
        code: "SE-COC-ANNUAL",
        version: "2026.1",
      },
    },
    update: {
      title: "Service Excellence and Code of Conduct Annual",
      passPercent: 80,
      isActive: true,
    },
    create: {
      organizationId: org.id,
      code: "SE-COC-ANNUAL",
      title: "Service Excellence and Code of Conduct Annual",
      version: "2026.1",
      passPercent: 80,
      isActive: true,
    },
  });

  await db.facilityRole.createMany({
    data: [
      {
        organizationId: org.id,
        name: "Clinical Staff",
        persona: "clinical",
        departments: ["Nursing", "Behavioral Health"],
      },
      {
        organizationId: org.id,
        name: "Non-Clinical Staff",
        persona: "nonclinical",
        departments: ["Admissions", "Support Services"],
      },
      {
        organizationId: org.id,
        name: "Leaders and Supervisors",
        persona: "leadership",
        departments: ["Management", "Operations"],
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete");
  console.log(`Organization slug: ${org.slug}`);
  console.log(`Owner email: ${ownerEmail}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
