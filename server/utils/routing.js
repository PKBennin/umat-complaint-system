// Server-side port of app.js:calculateRouting — resolves the destination staff
// member and routing metadata for a complaint from category + programme.

// Accepts a category by id ('academic') OR display name ('Academic & Exams'),
// and a programme by name. Returns routing fields to persist on the complaint.
async function computeRouting(conn, categoryKey, programmeName) {
  const [[category]] = await conn.query(
    'SELECT id, name, route_type FROM categories WHERE id = ? OR name = ? LIMIT 1',
    [categoryKey, categoryKey],
  );
  const [[programme]] = await conn.query(
    'SELECT id, name, department_id, faculty_key FROM programmes WHERE name = ? LIMIT 1',
    [programmeName],
  );

  if (!category || !programme) {
    return {
      ok: false,
      categoryId: category ? category.id : null,
      programmeId: programme ? programme.id : null,
      assignedStaffId: null,
      assignedName: 'General Administration Registry',
      routingDept: 'general_registry',
      facultyKey: null,
      facultyName: 'Central',
      role: 'University Registry',
    };
  }

  const facultyKey = programme.faculty_key;
  const [[faculty]] = await conn.query(
    'SELECT name FROM faculties WHERE faculty_key = ?', [facultyKey],
  );
  const facultyName = faculty ? faculty.name : facultyKey;

  const base = {
    ok: true,
    categoryId: category.id,
    programmeId: programme.id,
  };

  if (category.route_type === 'dean') {
    const [[dean]] = await conn.query(
      "SELECT staff_id, name, portfolio, department_label FROM staff WHERE faculty_key = ? AND type = 'Dean' LIMIT 1",
      [facultyKey],
    );
    return {
      ...base,
      assignedStaffId: dean ? dean.staff_id : null,
      assignedName: dean ? dean.name : 'Faculty Dean',
      role: dean ? dean.portfolio : 'Faculty Dean',
      routingDept: dean ? dean.department_label : `Dean's Office (${facultyKey})`,
      facultyKey,
      facultyName,
    };
  }

  if (category.route_type === 'finance') {
    const [[fin]] = await conn.query(
      "SELECT staff_id, name, portfolio FROM staff WHERE faculty_key = ? AND type = 'Finance' LIMIT 1",
      [facultyKey],
    );
    return {
      ...base,
      assignedStaffId: fin ? fin.staff_id : null,
      assignedName: fin ? fin.name : 'Faculty Finance Officer',
      role: fin ? fin.portfolio : 'Faculty Finance Officer',
      routingDept: 'finance_dept',
      facultyKey,
      facultyName,
    };
  }

  if (category.route_type === 'ict_dept') {
    const [[it]] = await conn.query(
      "SELECT staff_id, name, portfolio FROM staff WHERE type = 'IT' LIMIT 1",
    );
    return {
      ...base,
      assignedStaffId: it ? it.staff_id : null,
      assignedName: it ? it.name : 'IT Directorate Director',
      role: it ? it.portfolio : 'Central IT Directorate Director',
      routingDept: 'ict_dept',
      facultyKey: 'ict_dept',
      facultyName: 'Central IT Directorate',
    };
  }

  return {
    ...base,
    assignedStaffId: null,
    assignedName: 'General Administration',
    role: 'University Registry',
    routingDept: 'general_registry',
    facultyKey,
    facultyName,
  };
}

module.exports = { computeRouting };
