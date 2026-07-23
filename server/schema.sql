-- UMaT Campus Complaint System — MySQL schema
-- Based on backend_design.pdf §3, extended to a superset that preserves every
-- feature the existing frontend already implements (see server/README.md).
--
-- Superset additions over the PDF:
--   * complaints.urgency ENUM gains 'Critical'
--   * categories table (code <-> display name + route type)
--   * internal_notes table (staff-only confidential notes)
--   * directives table (student action items {text, completed})
--   * appointments gains instructions / feedback / completed_at columns and a
--     denormalised 'category-free' student-facing type set
--   * comments gains is_admin_instruction flag (admin -> student instructions)

CREATE DATABASE IF NOT EXISTS umat_complaints_db
  DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
USE umat_complaints_db;

-- Drop in dependency order so the script is re-runnable.
DROP TABLE IF EXISTS action_logs;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS internal_notes;
DROP TABLE IF EXISTS directives;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS programmes;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS faculties;

-- 1. Faculties
CREATE TABLE faculties (
  faculty_key VARCHAR(10) PRIMARY KEY,
  name        VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Departments
CREATE TABLE departments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(150) NOT NULL UNIQUE,
  faculty_key VARCHAR(10) NOT NULL,
  FOREIGN KEY (faculty_key) REFERENCES faculties(faculty_key) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Programmes
CREATE TABLE programmes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  department_id INT NOT NULL,
  faculty_key   VARCHAR(10) NOT NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON UPDATE CASCADE,
  FOREIGN KEY (faculty_key)   REFERENCES faculties(faculty_key) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3b. Categories (superset: maps category code <-> display name + routing type)
CREATE TABLE categories (
  id         VARCHAR(20) PRIMARY KEY,           -- e.g. 'academic','finance','ict','harassment','other'
  name       VARCHAR(100) NOT NULL,             -- e.g. 'Academic & Exams'
  route_type VARCHAR(20)  NOT NULL              -- 'dean' | 'finance' | 'ict_dept'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Administrative Staff / Admins
CREATE TABLE staff (
  staff_id      VARCHAR(20) PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  type          ENUM('Dean','Vice Dean','Faculty Officer','Finance','IT','HOD','Department Officer','SuperAdmin') NOT NULL,
  faculty_key   VARCHAR(10) NULL,
  department_id INT NULL,
  -- 'department' in the frontend staff record is a free-text office label
  -- (e.g. "Dean's Office (FCMS)", "finance_dept", "ict_dept"), not always a
  -- real department row, so it is stored verbatim here for routing/scoping.
  department_label VARCHAR(150) NULL,
  portfolio     VARCHAR(150) NULL,
  FOREIGN KEY (faculty_key)   REFERENCES faculties(faculty_key) ON UPDATE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Students
CREATE TABLE students (
  index_number  VARCHAR(15) PRIMARY KEY,
  name          VARCHAR(100) NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  phone         VARCHAR(20)  NULL,
  password_hash VARCHAR(255) NOT NULL,
  level         VARCHAR(10)  NULL,
  programme_id  INT NULL,
  reference_number CHAR(10) NULL,
  is_profile_complete TINYINT(1) DEFAULT 0,
  FOREIGN KEY (programme_id) REFERENCES programmes(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Complaints (Tickets)
CREATE TABLE complaints (
  id               VARCHAR(25) PRIMARY KEY,               -- e.g. UMAT-2026-X12Y
  student_index    VARCHAR(15) NOT NULL,
  subject          VARCHAR(150) NOT NULL,
  category_id      VARCHAR(20)  NOT NULL,
  urgency          ENUM('Low','Medium','High','Urgent','Critical') NOT NULL,
  description      TEXT NOT NULL,
  status           ENUM('Submitted','Under Review','In Progress','Resolved','Rejected')
                     NOT NULL DEFAULT 'Submitted',
  assigned_staff_id VARCHAR(20) NULL,
  -- Programme the student selected when filing (drives studentProgramme /
  -- studentDept in the frontend; may differ from the student's record).
  programme_id     INT NULL,
  -- Routing snapshot captured at filing time (mirrors frontend fields).
  routing_dept     VARCHAR(150) NULL,   -- staff.department_label of the routed office
  faculty_key      VARCHAR(10)  NULL,   -- faculty the ticket was routed within (recipient.facultyKey)
  -- Optional supporting attachment (transcript, receipt, photo). File itself
  -- lives on disk under server/uploads/; only metadata is stored here.
  attachment_stored_name    VARCHAR(255) NULL,  -- randomized name on disk
  attachment_original_name  VARCHAR(255) NULL,  -- filename as uploaded by the filer
  attachment_mimetype       VARCHAR(100) NULL,
  attachment_size           INT NULL,
  last_reminded_at TIMESTAMP NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_index)     REFERENCES students(index_number) ON UPDATE CASCADE,
  FOREIGN KEY (assigned_staff_id) REFERENCES staff(staff_id) ON UPDATE CASCADE,
  FOREIGN KEY (category_id)       REFERENCES categories(id) ON UPDATE CASCADE,
  FOREIGN KEY (programme_id)      REFERENCES programmes(id) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Action / Audit Logs  (frontend "timeline")
CREATE TABLE action_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id  VARCHAR(25) NOT NULL,
  operator_name VARCHAR(100) NOT NULL,   -- timeline.by  ("System Engine", staff name, "Student (Ledger)")
  action_type   VARCHAR(100) NOT NULL,   -- timeline.action
  details       TEXT NOT NULL,           -- timeline.message
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,   -- timeline.date
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Counselor / Meeting Appointments (1:1 with a complaint)
CREATE TABLE appointments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id   VARCHAR(25) NOT NULL UNIQUE,
  type           VARCHAR(50) NOT NULL,   -- 'in-person' | 'counselor' (frontend) — free text for flexibility
  date_time      VARCHAR(100) NULL,      -- stored as provided by admin (ISO or free text)
  venue          VARCHAR(150) NULL,
  instructions   TEXT NULL,              -- superset: student-facing instructions
  counselor_name VARCHAR(100) NULL,
  checklist      TEXT NULL,              -- optional JSON string
  status         ENUM('Scheduled','Completed','Cancelled') NOT NULL DEFAULT 'Scheduled',
  completed      TINYINT(1) NOT NULL DEFAULT 0,
  completed_at   TIMESTAMP NULL,
  feedback       TEXT NULL,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Thread Comments (two-way; is_admin_instruction => shown to student as instruction)
CREATE TABLE comments (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id VARCHAR(25) NOT NULL,
  sender_type  ENUM('student','staff') NOT NULL,
  sender_name  VARCHAR(100) NOT NULL,
  message      TEXT NOT NULL,
  is_admin_instruction TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Internal Notes (superset: staff-only, never shown to students)
CREATE TABLE internal_notes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id VARCHAR(25) NOT NULL,
  operator_name VARCHAR(100) NOT NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Directives (superset: student action items {text, completed})
CREATE TABLE directives (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  complaint_id VARCHAR(25) NOT NULL,
  text         VARCHAR(500) NOT NULL,
  completed    TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Index optimisations for lookup performance
CREATE INDEX idx_complaints_student  ON complaints(student_index);
CREATE INDEX idx_complaints_assigned ON complaints(assigned_staff_id);
CREATE INDEX idx_complaints_status   ON complaints(status);
CREATE INDEX idx_complaints_faculty  ON complaints(faculty_key);
CREATE INDEX idx_actionlogs_complaint ON action_logs(complaint_id);
CREATE INDEX idx_comments_complaint  ON comments(complaint_id);
CREATE INDEX idx_notes_complaint     ON internal_notes(complaint_id);
CREATE INDEX idx_directives_complaint ON directives(complaint_id);
