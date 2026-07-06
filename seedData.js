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
  "Department of Mining Engineering",
  "Department of Mineral Engineering",
  "Department of Computer Science and Engineering",
  "Department of Mathematical Sciences",
  "Department of Cybersecurity and Information Systems",
  "Department of Technical Communication",
  "Department of Management Studies",
  "Department of Mechanical Engineering",
  "Department of Electrical and Electronic Engineering",
  "Department of Renewable Energy Engineering",
  "Department of Geological Engineering",
  "Department of Geomatic Engineering",
  "Department of Environmental and Safety Engineering",
  "Department of Petroleum and Natural Gas Engineering",
  "Department of Petroleum Geosciences and Engineering",
  "Department of Chemical and Petrochemical Engineering"
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
  { index: "9011223344", name: "Henry Appiah Jnr", password: "9011223344", email: "happiah344@umat.edu.gh", phone: "+233 54 123 4567", level: "300" },
  { index: "9012870422", name: "Bennin Paa Kofi", password: "9012870422", email: "bkofi422@umat.edu.gh", phone: "+233 20 987 6543", level: "400" },
  { index: "9013456789", name: "Oman Kofi Arthur", password: "9013456789", email: "oarthur789@umat.edu.gh", phone: "+233 24 456 7890", level: "200" },
  { index: "9014567890", name: "Leticia Oppong", password: "9014567890", email: "loppong890@umat.edu.gh", phone: "+233 50 654 3210", level: "100" },
  { index: "9015678901", name: "Michael Boateng", password: "9015678901", email: "mboateng901@umat.edu.gh", phone: "+233 55 789 0123", level: "300" },
  { index: "9016789012", name: "Kofi Nkrumah", password: "9016789012", email: "knkrumah012@umat.edu.gh", phone: "+233 27 123 8901", level: "200" },
  { index: "9017890123", name: "Yaa Ampofo", password: "9017890123", email: "yampofo123@umat.edu.gh", phone: "+233 26 234 5678", level: "400" },
  { index: "9018901234", name: "John Koomson", password: "9018901234", email: "jkoomson234@umat.edu.gh", phone: "+233 54 890 1234", level: "300" },
  { index: "9019012345", name: "Ama Serwaa", password: "9019012345", email: "aserwaa345@umat.edu.gh", phone: "+233 24 567 8901", level: "200" },
  { index: "9010123456", name: "Isaac Mensah", password: "9010123456", email: "imensah456@umat.edu.gh", phone: "+233 20 678 9012", level: "400" }
];

// Mock staff credentials
// Staff IDs follow UMaT's real convention: PS### for Permanent Staff,
// CS### for Contract Staff. Deans/HODs (substantive academic leadership) are
// PS; Finance Officers and IT support (often outsourced/contract) are CS.
const STAFF_DATABASE = [
  // Deans (Faculty Heads - resolve Academic, Harassment, Others for their Faculty)
  { email: "emmanuel.temeng@umat.edu.gh", staffId: "PS101", facultyKey: "FMMT", name: "Prof. Emmanuel Temeng", portfolio: "Dean, Faculty of Mining & Mineral Technology", type: "Dean", department: "Dean's Office (FMMT)" },
  { email: "anthony.simons@umat.edu.gh", staffId: "PS102", facultyKey: "FCMS", name: "Prof. Anthony Simons", portfolio: "Dean, Faculty of Computing & Mathematical Sciences", type: "Dean", department: "Dean's Office (FCMS)" },
  { email: "sylvester.kojo@umat.edu.gh", staffId: "PS103", facultyKey: "FIMS", name: "Dr. Sylvester A. Kojo", portfolio: "Dean, Faculty of Integrated Management Studies", type: "Dean", department: "Dean's Office (FIMS)" },
  { email: "richard.amorin@umat.edu.gh", staffId: "PS104", facultyKey: "FoE", name: "Prof. Richard A. Amorin", portfolio: "Dean, Faculty of Engineering", type: "Dean", department: "Dean's Office (FoE)" },
  { email: "patricia.afriyie@umat.edu.gh", staffId: "PS105", facultyKey: "FGES", name: "Dr. Patricia B. Afriyie", portfolio: "Dean, Faculty of Geosciences & Environmental Studies", type: "Dean", department: "Dean's Office (FGES)" },
  { email: "frank.okyere@umat.edu.gh", staffId: "PS106", facultyKey: "SPetS", name: "Dr. Frank T. Okyere", portfolio: "Dean, School of Petroleum Studies", type: "Dean", department: "Dean's Office (SPetS)" },

  // Faculty Finance Officers (resolve Fees & Finance for their Faculty)
  { email: "fmmt.finance@umat.edu.gh", staffId: "CS101", facultyKey: "FMMT", name: "Mr. Vincent Shearer", portfolio: "Faculty Finance Officer, FMMT", type: "Finance", department: "finance_dept" },
  { email: "vincent.shearer@umat.edu.gh", staffId: "CS102", facultyKey: "FCMS", name: "Mr. Vincent Shearer", portfolio: "Faculty Finance Officer, FCMS", type: "Finance", department: "finance_dept" },
  { email: "fims.finance@umat.edu.gh", staffId: "CS103", facultyKey: "FIMS", name: "Mrs. Sophia A. Nti", portfolio: "Faculty Finance Officer, FIMS", type: "Finance", department: "finance_dept" },
  { email: "foe.finance@umat.edu.gh", staffId: "CS104", facultyKey: "FoE", name: "Mr. Kojo Boateng", portfolio: "Faculty Finance Officer, FoE", type: "Finance", department: "finance_dept" },
  { email: "fges.finance@umat.edu.gh", staffId: "CS105", facultyKey: "FGES", name: "Dr. Gladys A. Ansong", portfolio: "Faculty Finance Officer, FGES", type: "Finance", department: "finance_dept" },
  { email: "spets.finance@umat.edu.gh", staffId: "CS106", facultyKey: "SPetS", name: "Mrs. Evelyn Boateng", portfolio: "Faculty Finance Officer, SPetS", type: "Finance", department: "finance_dept" },

  // IT Staff (Central IT Directorate - resolve ICT Portal Services school-wide)
  { email: "frank.boateng@umat.edu.gh", staffId: "CS107", facultyKey: "ict_dept", name: "Mr. Frank A. Boateng", portfolio: "Central IT Directorate Director", type: "IT", department: "ict_dept" },

  // HODs (Heads of Department - Analytics Only)
  { email: "mining.hod@umat.edu.gh", staffId: "PS107", facultyKey: "FMMT", name: "Dr. Joseph K. B. Asamoah", portfolio: "HOD, Mining Engineering", type: "HOD", department: "Department of Mining Engineering" },
  { email: "mineral.hod@umat.edu.gh", staffId: "PS108", facultyKey: "FMMT", name: "Dr. Gladys A. Ansong", portfolio: "HOD, Mineral Engineering", type: "HOD", department: "Department of Mineral Engineering" },
  { email: "albert.mensah@umat.edu.gh", staffId: "PS109", facultyKey: "FCMS", name: "Dr. Albert K. Mensah", portfolio: "HOD, Computer Science & Engineering", type: "HOD", department: "Department of Computer Science and Engineering" },
  { email: "nana.frempong@umat.edu.gh", staffId: "PS110", facultyKey: "FCMS", name: "Dr. Nana K. Frempong", portfolio: "HOD, Mathematical Sciences", type: "HOD", department: "Department of Mathematical Sciences" },
  { email: "cyber.hod@umat.edu.gh", staffId: "PS111", facultyKey: "FCMS", name: "Dr. Sylvester A. Kojo", portfolio: "HOD, Cybersecurity and Information Systems", type: "HOD", department: "Department of Cybersecurity and Information Systems" },
  { email: "techcomm.hod@umat.edu.gh", staffId: "PS112", facultyKey: "FIMS", name: "Mrs. Sophia A. Nti", portfolio: "HOD, Technical Communication", type: "HOD", department: "Department of Technical Communication" },
  { email: "management.hod@umat.edu.gh", staffId: "PS113", facultyKey: "FIMS", name: "Prof. Anthony Simons", portfolio: "HOD, Management Studies", type: "HOD", department: "Department of Management Studies" },
  { email: "mechanical.hod@umat.edu.gh", staffId: "PS114", facultyKey: "FoE", name: "Dr. Frank T. Okyere", portfolio: "HOD, Mechanical Engineering", type: "HOD", department: "Department of Mechanical Engineering" },
  { email: "electrical.hod@umat.edu.gh", staffId: "PS115", facultyKey: "FoE", name: "Dr. Sylvester Kojo", portfolio: "HOD, Electrical and Electronic Engineering", type: "HOD", department: "Department of Electrical and Electronic Engineering" },
  { email: "renewable.hod@umat.edu.gh", staffId: "PS116", facultyKey: "FoE", name: "Mr. Ebenezer Mensah", portfolio: "HOD, Renewable Energy Engineering", type: "HOD", department: "Department of Renewable Energy Engineering" },
  { email: "geological.hod@umat.edu.gh", staffId: "PS117", facultyKey: "FGES", name: "Dr. Patricia B. Afriyie", portfolio: "HOD, Geological Engineering", type: "HOD", department: "Department of Geological Engineering" },
  { email: "geomatic.hod@umat.edu.gh", staffId: "PS118", facultyKey: "FGES", name: "Dr. Gladys A. Ansong", portfolio: "HOD, Geomatic Engineering", type: "HOD", department: "Department of Geomatic Engineering" },
  { email: "environmental.hod@umat.edu.gh", staffId: "PS119", facultyKey: "FGES", name: "Dr. Frank T. Okyere", portfolio: "HOD, Environmental & Safety Engineering", type: "HOD", department: "Department of Environmental and Safety Engineering" },
  { email: "petroleum.hod@umat.edu.gh", staffId: "PS120", facultyKey: "SPetS", name: "Prof. Richard A. Amorin", portfolio: "HOD, Petroleum & Natural Gas Engineering", type: "HOD", department: "Department of Petroleum and Natural Gas Engineering" },
  { email: "petrogeoscience.hod@umat.edu.gh", staffId: "PS121", facultyKey: "SPetS", name: "Dr. Albert K. Mensah", portfolio: "HOD, Petroleum Geosciences & Engineering", type: "HOD", department: "Department of Petroleum Geosciences and Engineering" },
  { email: "chemical.hod@umat.edu.gh", staffId: "PS122", facultyKey: "SPetS", name: "Dr. Sylvester A. Kojo", portfolio: "HOD, Chemical & Petrochemical Engineering", type: "HOD", department: "Department of Chemical and Petrochemical Engineering" }
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
