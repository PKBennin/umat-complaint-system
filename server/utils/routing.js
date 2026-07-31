// Server-side port of app.js:calculateRouting — resolves the destination staff
// member and routing metadata for a complaint from category + programme.
//
// Routing rules (confirmed):
//   ICT & Portal Services  → direct to IT Directorate
//   Harassment             → direct to Dean (full action owner)
//   Academic, Fees, Others → HOD first (HOD assigns to staff)

// Accepts a category by id ('academic') OR display name ('Academic & Exams'),
// and a programme by name. Returns routing fields to persist on the complaint.
async function computeRouting(conn, categoryKey, programmeName) {
  const [[category]] = await conn.query(
    'SELECT id, name, route_type FROM categories WHERE id = ? OR name = ? LIMIT 1',
    [categoryKey, categoryKey],
  );

  let [[programme]] = await conn.query(
    'SELECT id, name, department_id, faculty_key FROM programmes WHERE name = ? LIMIT 1',
    [programmeName],
  );

  if (!programme && programmeName) {
    const altName = programmeName.replace(/\b&\b/g, 'and');
    const cleanName = programmeName.replace(/^BSc\s+/i, '').trim();
    const [[matched]] = await conn.query(
      `SELECT id, name, department_id, faculty_key FROM programmes 
       WHERE name = ? OR name = ? OR LOWER(name) LIKE CONCAT('%', LOWER(?), '%') LIMIT 1`,
      [altName, cleanName, cleanName],
    );
    if (matched) programme = matched;
  }

  const facultyKey = programme ? programme.faculty_key : 'FCaMS';

  const [[faculty]] = await conn.query(
    'SELECT name FROM faculties WHERE faculty_key = ?', [facultyKey],
  );
  const facultyName = faculty ? faculty.name : facultyKey;

  const base = {
    ok: true,
    categoryId: category ? category.id : 'academic',
    programmeId: programme ? programme.id : null,
  };

  // ── ICT complaints → direct to IT Directorate (unchanged) ──────────────
  if (category.route_type === 'ict_dept') {
    const [[it]] = await conn.query(
      "SELECT staff_id, name, portfolio FROM staff WHERE type = 'IT' LIMIT 1",
    );
    return {
      ...base,
      assignedStaffId: it ? it.staff_id : null,
      hodStaffId: null, // no HOD involvement
      assignedName: it ? it.name : 'IT Directorate Director',
      role: it ? it.portfolio : 'Central IT Directorate Director',
      routingDept: 'ict_dept',
      facultyKey: 'ict_dept',
      facultyName: 'Central IT Directorate',
    };
  }

  // ── Harassment complaints → direct to Dean (full action owner) ─────────
  if (category.name === 'Harassment') {
    const [[dean]] = await conn.query(
      "SELECT staff_id, name, portfolio, department_label FROM staff WHERE faculty_key = ? AND type = 'Dean' LIMIT 1",
      [facultyKey],
    );
    return {
      ...base,
      assignedStaffId: dean ? dean.staff_id : null,
      hodStaffId: null, // no HOD involvement for harassment
      assignedName: dean ? dean.name : 'Faculty Dean',
      role: dean ? dean.portfolio : 'Faculty Dean',
      routingDept: dean ? dean.department_label : `Dean's Office (${facultyKey})`,
      facultyKey,
      facultyName,
    };
  }

  // ── All other categories (Academic, Fees, Others) → HOD first ──────────
  // HOD receives the complaint. HOD then assigns to the appropriate officer.
  const [[hod]] = await conn.query(
    "SELECT staff_id, name, portfolio, department_label FROM staff WHERE faculty_key = ? AND type = 'HOD' LIMIT 1",
    [facultyKey],
  );
  return {
    ...base,
    assignedStaffId: hod ? hod.staff_id : null,
    hodStaffId: hod ? hod.staff_id : null,
    assignedName: hod ? hod.name : 'Head of Department',
    role: hod ? hod.portfolio : 'Head of Department',
    routingDept: hod ? hod.department_label : `HOD Office (${facultyKey})`,
    facultyKey,
    facultyName,
  };
}

module.exports = { computeRouting };
