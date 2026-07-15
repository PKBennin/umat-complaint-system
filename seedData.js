// UMaT Campus Complaint Management System - Seed Data
// This data acts as the initial state of our local storage database

const FACULTIES = {
  FMMT: "Faculty of Mining and Mineral Technology",
  FCMS: "Faculty of Computing and Mathematical Sciences",
  FIMS: "Faculty of Integrated Management Studies",
  FoE: "Faculty of Engineering",
  FGES: "Faculty of Geosciences and Environmental Studies",
  SPetS: "School of Petroleum Studies",
  ict_dept: "Central IT Directorate"
};

const DEPARTMENTS = [
  { name: "Department of Mining Engineering", facultyKey: "FMMT" },
  { name: "Department of Mineral Engineering", facultyKey: "FMMT" },
  { name: "Department of Computer Science and Engineering", facultyKey: "FCMS" },
  { name: "Department of Mathematical Sciences", facultyKey: "FCMS" },
  { name: "Department of Cybersecurity and Information Systems", facultyKey: "FCMS" },
  { name: "Department of Technical Communication", facultyKey: "FIMS" },
  { name: "Department of Management Studies", facultyKey: "FIMS" },
  { name: "Department of Mechanical Engineering", facultyKey: "FoE" },
  { name: "Department of Electrical and Electronic Engineering", facultyKey: "FoE" },
  { name: "Department of Renewable Energy Engineering", facultyKey: "FoE" },
  { name: "Department of Geological Engineering", facultyKey: "FGES" },
  { name: "Department of Geomatic Engineering", facultyKey: "FGES" },
  { name: "Department of Environmental and Safety Engineering", facultyKey: "FGES" },
  { name: "Department of Petroleum and Natural Gas Engineering", facultyKey: "SPetS" },
  { name: "Department of Petroleum Geosciences and Engineering", facultyKey: "SPetS" },
  { name: "Department of Chemical and Petrochemical Engineering", facultyKey: "SPetS" }
];

const PROGRAMMES = [
  // FMMT
  { name: "BSc Mining Engineering", department: "Department of Mining Engineering", facultyKey: "FMMT" },
  { name: "BSc Mineral Engineering", department: "Department of Mineral Engineering", facultyKey: "FMMT" },
  // FCMS
  { name: "BSc Computer Science and Engineering", department: "Department of Computer Science and Engineering", facultyKey: "FCMS" },
  { name: "BSc Mathematics", department: "Department of Mathematical Sciences", facultyKey: "FCMS" },
  { name: "BSc Actuarial Science", department: "Department of Mathematical Sciences", facultyKey: "FCMS" },
  { name: "BSc Cybersecurity", department: "Department of Cybersecurity and Information Systems", facultyKey: "FCMS" },
  { name: "BSc Information Systems", department: "Department of Cybersecurity and Information Systems", facultyKey: "FCMS" },
  // FIMS
  { name: "BSc Technical Communication", department: "Department of Technical Communication", facultyKey: "FIMS" },
  { name: "BSc Business Management", department: "Department of Management Studies", facultyKey: "FIMS" },
  // FoE
  { name: "BSc Mechanical Engineering", department: "Department of Mechanical Engineering", facultyKey: "FoE" },
  { name: "BSc Electrical and Electronic Engineering", department: "Department of Electrical and Electronic Engineering", facultyKey: "FoE" },
  { name: "BSc Renewable Energy Engineering", department: "Department of Renewable Energy Engineering", facultyKey: "FoE" },
  // FGES
  { name: "BSc Geological Engineering", department: "Department of Geological Engineering", facultyKey: "FGES" },
  { name: "BSc Geomatic Engineering", department: "Department of Geomatic Engineering", facultyKey: "FGES" },
  { name: "BSc Environmental and Safety Engineering", department: "Department of Environmental and Safety Engineering", facultyKey: "FGES" },
  // SPetS
  { name: "BSc Petroleum Engineering", department: "Department of Petroleum and Natural Gas Engineering", facultyKey: "SPetS" },
  { name: "BSc Petroleum Geosciences", department: "Department of Petroleum Geosciences and Engineering", facultyKey: "SPetS" },
  { name: "BSc Chemical Engineering", department: "Department of Chemical and Petrochemical Engineering", facultyKey: "SPetS" }
];

const CATEGORIES = [
  { id: "academic", name: "Academic & Exams", routeType: "dean" },
  { id: "finance", name: "Fees & Finance", routeType: "finance" },
  { id: "ict", name: "ICT & Portal Services", routeType: "ict_dept" },
  { id: "harassment", name: "Harassment", routeType: "dean" },
  { id: "other", name: "Others", routeType: "dean" }
];

// Mock student credentials
// Student index numbers are exactly 10 digits (UMaT convention), e.g. 9012870422.
const STUDENT_DATABASE = [
  { index: "9012870422", name: "Bennin paa kofi", password: "9012870422", email: "bpkofi@gmail.com", phone: "0535620797", level: "400", programmeName: "BSc Computer Science and Engineering" },
  { index: "9012705022", name: "Kofi oman", password: "9012705022", email: "koman022@umat.edu.gh", phone: "0531415330", level: "300", programmeName: "BSc Geological Engineering" },
  { index: "9012422202", name: "Henry appiah", password: "9012422202", email: "happiah202@umat.edu.gh", phone: "0200420055", level: "200", programmeName: "BSc Business Management" },
  { index: "9012870432", name: "Michael Boateng", password: "9012870432", email: "mboateng432@umat.edu.gh", phone: "0599410986", level: "300", programmeName: "BSc Petroleum Engineering" },
  { index: "8012470422", name: "Leticia oppong", password: "8012470422", email: "loppong422@umat.edu.gh", phone: "0594910043", level: "100", programmeName: "BSc Renewable Energy Engineering" },
  { index: "9012472222", name: "Eugene Amoah", password: "9012472222", email: "eamoah222@umat.edu.gh", phone: "0557161260", level: "400", programmeName: "BSc Mining Engineering" },
  { index: "9012870433", name: "Joel Baidoo", password: "9012870433", email: "jbaidoo433@umat.edu.gh", phone: "0202748601", level: "300", programmeName: "BSc Information Systems" }
];

// Mock staff credentials
// Staff IDs follow UMaT's real convention: PS### for Permanent Staff,
// CS### for Contract Staff. Deans/HODs (substantive academic leadership) are
// PS; Finance Officers and IT support (often outsourced/contract) are CS.
const STAFF_DATABASE = [
  // System Administrator (Portal Manager)
  { email: "admin@umat.edu.gh", staffId: "ADMIN001", facultyKey: null, name: "System Administrator", portfolio: "Super Administrator", type: "SuperAdmin", department: "Central Administration" }
];

const SEED_COMPLAINTS = [];

// Automatic one-time database clear requested by the user
if (!localStorage.getItem('database_cleared_v3')) {
  localStorage.clear();
  localStorage.setItem('database_cleared_v3', 'true');
}

// Export modules if in Node, otherwise attach to window for browser script tag
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FACULTIES, DEPARTMENTS, PROGRAMMES, CATEGORIES, STUDENT_DATABASE, STAFF_DATABASE, SEED_COMPLAINTS };
} else {
  window.FACULTIES = FACULTIES;
  window.DEPARTMENTS = DEPARTMENTS;
  window.PROGRAMMES = PROGRAMMES;
  window.CATEGORIES = CATEGORIES;
  window.STUDENT_DATABASE = STUDENT_DATABASE;
  window.STAFF_DATABASE = STAFF_DATABASE;
  window.SEED_COMPLAINTS = SEED_COMPLAINTS;
}
