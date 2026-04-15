-- Learnly LMS MySQL schema
-- Create database separately (recommended): CREATE DATABASE learnly_lms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student','instructor','admin') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'General',
  instructor_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_courses_instructor_id (instructor_id),
  KEY idx_courses_created_at (created_at),
  FULLTEXT KEY ft_courses_title_desc (title, description),
  CONSTRAINT fk_courses_instructor FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_enroll_course_student (course_id, student_id),
  KEY idx_enroll_student_id (student_id),
  CONSTRAINT fk_enroll_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_enroll_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS course_materials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  type ENUM('pdf','video','link') NOT NULL,
  title VARCHAR(200) NOT NULL,
  url VARCHAR(2000) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_materials_course_id (course_id),
  CONSTRAINT fk_materials_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_materials_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  due_date DATETIME(3) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_assign_course_id (course_id),
  KEY idx_assign_due_date (due_date),
  CONSTRAINT fk_assign_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_assign_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  text MEDIUMTEXT NULL,
  file_original_name VARCHAR(255) NULL,
  file_mime_type VARCHAR(255) NULL,
  file_size INT UNSIGNED NULL,
  file_path VARCHAR(500) NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  grade_score INT NULL,
  grade_feedback TEXT NULL,
  graded_by BIGINT UNSIGNED NULL,
  graded_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sub_assignment_student (assignment_id, student_id),
  KEY idx_sub_assignment (assignment_id),
  KEY idx_sub_course (course_id),
  KEY idx_sub_student (student_id),
  CONSTRAINT fk_sub_assignment FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sub_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sub_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sub_graded_by FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(80) NOT NULL,
  message VARCHAR(500) NOT NULL,
  meta JSON NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id),
  KEY idx_notif_read (read_at),
  KEY idx_notif_created (created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quizzes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  instructions TEXT NULL,
  time_limit_minutes INT UNSIGNED NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_quiz_course (course_id),
  CONSTRAINT fk_quiz_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quiz_questions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_id BIGINT UNSIGNED NOT NULL,
  question VARCHAR(500) NOT NULL,
  option_a VARCHAR(200) NOT NULL,
  option_b VARCHAR(200) NOT NULL,
  option_c VARCHAR(200) NOT NULL,
  option_d VARCHAR(200) NOT NULL,
  correct_option ENUM('A','B','C','D') NOT NULL,
  marks INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_qq_quiz (quiz_id),
  CONSTRAINT fk_qq_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quiz_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  answers JSON NOT NULL,
  score INT NOT NULL,
  total_questions INT NOT NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_quiz_attempt_quiz (quiz_id),
  KEY idx_quiz_attempt_student (student_id),
  KEY idx_quiz_attempt_submitted (submitted_at),
  CONSTRAINT fk_quiz_attempt_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_quiz_attempt_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id BIGINT UNSIGNED NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  audience ENUM('all','students','instructors','admins','course') NOT NULL DEFAULT 'course',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_announcement_course (course_id),
  KEY idx_announcement_author (author_id),
  KEY idx_announcement_audience (audience),
  CONSTRAINT fk_announcement_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_announcement_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(120) NULL,
  bio TEXT NULL,
  phone VARCHAR(40) NULL,
  timezone VARCHAR(80) NULL,
  avatar_url VARCHAR(500) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_hash (token_hash),
  KEY idx_password_resets_user (user_id),
  KEY idx_password_resets_expires (expires_at),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS role_permissions (
  permission_key VARCHAR(100) NOT NULL,
  label VARCHAR(200) NOT NULL,
  student_allowed TINYINT(1) NOT NULL DEFAULT 0,
  instructor_allowed TINYINT(1) NOT NULL DEFAULT 0,
  admin_allowed TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (permission_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  message VARCHAR(500) NOT NULL,
  meta JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_logs_created (created_at),
  KEY idx_audit_logs_action (action),
  KEY idx_audit_logs_actor (actor_user_id),
  CONSTRAINT fk_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;
