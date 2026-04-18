//! Integration tests for file operations
//!
//! These tests verify file operation behaviors using actual filesystem operations
//! with tempfile for safe, isolated test environments.

use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use tempfile::TempDir;

/// Test helper to create a temp directory with test files
fn setup_test_dir() -> TempDir {
    let temp = TempDir::new().expect("Failed to create temp directory");

    // Create test structure
    let base = temp.path();
    fs::create_dir_all(base.join("src")).unwrap();
    fs::create_dir_all(base.join("src/nested")).unwrap();
    fs::create_dir_all(base.join("empty_dir")).unwrap();

    File::create(base.join("file1.txt"))
        .unwrap()
        .write_all(b"content1")
        .unwrap();
    File::create(base.join("file2.txt"))
        .unwrap()
        .write_all(b"content2")
        .unwrap();
    File::create(base.join("src/source.rs"))
        .unwrap()
        .write_all(b"fn main() {}")
        .unwrap();
    File::create(base.join("src/nested/deep.txt"))
        .unwrap()
        .write_all(b"deep content")
        .unwrap();

    temp
}

// ============================================================================
// File Copy Integration Tests
// ============================================================================

#[test]
fn test_copy_single_file_integration() {
    let temp = setup_test_dir();
    let src = temp.path().join("file1.txt");
    let dest = temp.path().join("file1_copy.txt");

    // Perform copy
    fs::copy(&src, &dest).expect("Copy failed");

    // Verify
    assert!(dest.exists());
    let content = fs::read_to_string(&dest).unwrap();
    assert_eq!(content, "content1");
    assert!(src.exists()); // Source should still exist
}

#[test]
fn test_copy_preserves_content() {
    let temp = setup_test_dir();

    // Create file with specific content
    let src = temp.path().join("original.bin");
    let content: Vec<u8> = (0..=255).collect();
    fs::write(&src, &content).unwrap();

    let dest = temp.path().join("copy.bin");
    fs::copy(&src, &dest).unwrap();

    let copied = fs::read(&dest).unwrap();
    assert_eq!(content, copied);
}

#[test]
fn test_copy_directory_recursive_integration() {
    let temp = setup_test_dir();
    let src_dir = temp.path().join("src");
    let dest_dir = temp.path().join("src_backup");

    // Copy directory recursively using walkdir pattern
    copy_dir_all(&src_dir, &dest_dir).expect("Directory copy failed");

    // Verify structure
    assert!(dest_dir.exists());
    assert!(dest_dir.join("source.rs").exists());
    assert!(dest_dir.join("nested").exists());
    assert!(dest_dir.join("nested/deep.txt").exists());

    // Verify content
    let content = fs::read_to_string(dest_dir.join("source.rs")).unwrap();
    assert_eq!(content, "fn main() {}");
}

/// Helper function to copy directory recursively
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

// ============================================================================
// File Move Integration Tests
// ============================================================================

#[test]
fn test_move_file_integration() {
    let temp = setup_test_dir();
    let src = temp.path().join("file1.txt");
    let dest = temp.path().join("moved.txt");

    let original_content = fs::read_to_string(&src).unwrap();

    fs::rename(&src, &dest).expect("Move failed");

    assert!(!src.exists());
    assert!(dest.exists());

    let content = fs::read_to_string(&dest).unwrap();
    assert_eq!(content, original_content);
}

#[test]
fn test_move_directory_integration() {
    let temp = setup_test_dir();
    let src_dir = temp.path().join("src");
    let dest_dir = temp.path().join("moved_src");

    fs::rename(&src_dir, &dest_dir).expect("Directory move failed");

    assert!(!src_dir.exists());
    assert!(dest_dir.exists());
    assert!(dest_dir.join("source.rs").exists());
    assert!(dest_dir.join("nested/deep.txt").exists());
}

// ============================================================================
// File Delete Integration Tests
// ============================================================================

#[test]
fn test_delete_file_integration() {
    let temp = setup_test_dir();
    let file = temp.path().join("file1.txt");

    assert!(file.exists());
    fs::remove_file(&file).expect("Delete failed");
    assert!(!file.exists());
}

#[test]
fn test_delete_empty_directory_integration() {
    let temp = setup_test_dir();
    let dir = temp.path().join("empty_dir");

    assert!(dir.exists());
    fs::remove_dir(&dir).expect("Delete empty dir failed");
    assert!(!dir.exists());
}

#[test]
fn test_delete_directory_with_contents_integration() {
    let temp = setup_test_dir();
    let dir = temp.path().join("src");

    assert!(dir.exists());
    fs::remove_dir_all(&dir).expect("Delete dir with contents failed");
    assert!(!dir.exists());
}

// ============================================================================
// Directory Creation Integration Tests
// ============================================================================

#[test]
fn test_create_directory_integration() {
    let temp = setup_test_dir();
    let new_dir = temp.path().join("new_directory");

    assert!(!new_dir.exists());
    fs::create_dir(&new_dir).expect("Create directory failed");
    assert!(new_dir.exists());
    assert!(new_dir.is_dir());
}

#[test]
fn test_create_nested_directories_integration() {
    let temp = setup_test_dir();
    let nested = temp.path().join("a/b/c/d/e");

    assert!(!nested.exists());
    fs::create_dir_all(&nested).expect("Create nested dirs failed");
    assert!(nested.exists());
    assert!(nested.is_dir());
}

// ============================================================================
// Rename Integration Tests
// ============================================================================

#[test]
fn test_rename_file_integration() {
    let temp = setup_test_dir();
    let old = temp.path().join("file1.txt");
    let new = temp.path().join("renamed.txt");

    let content = fs::read_to_string(&old).unwrap();
    fs::rename(&old, &new).expect("Rename failed");

    assert!(!old.exists());
    assert!(new.exists());
    assert_eq!(fs::read_to_string(&new).unwrap(), content);
}

#[test]
fn test_rename_directory_integration() {
    let temp = setup_test_dir();
    let old = temp.path().join("src");
    let new = temp.path().join("source_code");

    fs::rename(&old, &new).expect("Rename directory failed");

    assert!(!old.exists());
    assert!(new.exists());
    assert!(new.join("source.rs").exists());
}

// ============================================================================
// Symlink Integration Tests (Unix only)
// ============================================================================

#[cfg(unix)]
mod symlink_tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn test_create_symlink_integration() {
        let temp = setup_test_dir();
        let target = temp.path().join("file1.txt");
        let link = temp.path().join("link_to_file1");

        symlink(&target, &link).expect("Create symlink failed");

        assert!(link.exists());
        assert!(link.is_symlink());

        // Reading through symlink should work
        let content = fs::read_to_string(&link).unwrap();
        assert_eq!(content, "content1");
    }

    #[test]
    fn test_delete_symlink_not_target_integration() {
        let temp = setup_test_dir();
        let target = temp.path().join("file1.txt");
        let link = temp.path().join("link_to_file1");

        symlink(&target, &link).unwrap();

        // Delete symlink
        fs::remove_file(&link).expect("Delete symlink failed");

        // Symlink should be gone
        assert!(!link.exists());
        // Target should still exist
        assert!(target.exists());
    }

    #[test]
    fn test_symlink_to_directory_integration() {
        let temp = setup_test_dir();
        let target_dir = temp.path().join("src");
        let link = temp.path().join("src_link");

        symlink(&target_dir, &link).expect("Create dir symlink failed");

        assert!(link.is_symlink());
        // Can access files through symlink
        assert!(link.join("source.rs").exists());
    }
}

// ============================================================================
// Error Handling Integration Tests
// ============================================================================

#[test]
fn test_copy_nonexistent_source() {
    let temp = setup_test_dir();
    let src = temp.path().join("nonexistent.txt");
    let dest = temp.path().join("dest.txt");

    let result = fs::copy(&src, &dest);
    assert!(result.is_err());
}

#[test]
fn test_create_directory_already_exists() {
    let temp = setup_test_dir();
    let dir = temp.path().join("src");

    // Directory already exists
    let result = fs::create_dir(&dir);
    assert!(result.is_err());
}

#[test]
fn test_delete_nonexistent_file() {
    let temp = setup_test_dir();
    let file = temp.path().join("nonexistent.txt");

    let result = fs::remove_file(&file);
    assert!(result.is_err());
}

#[test]
fn test_rename_nonexistent() {
    let temp = setup_test_dir();
    let old = temp.path().join("nonexistent.txt");
    let new = temp.path().join("new.txt");

    let result = fs::rename(&old, &new);
    assert!(result.is_err());
}

// ============================================================================
// Large File Integration Tests
// ============================================================================

#[test]
fn test_copy_large_file_integration() {
    let temp = setup_test_dir();
    let src = temp.path().join("large.bin");
    let dest = temp.path().join("large_copy.bin");

    // Create a 1MB file
    let size = 1024 * 1024;
    let data: Vec<u8> = (0..size).map(|i| (i % 256) as u8).collect();
    fs::write(&src, &data).unwrap();

    fs::copy(&src, &dest).expect("Large file copy failed");

    assert!(dest.exists());
    let copied = fs::read(&dest).unwrap();
    assert_eq!(data.len(), copied.len());
    assert_eq!(data, copied);
}

// ============================================================================
// Permissions Integration Tests (Unix only)
// ============================================================================

#[cfg(unix)]
mod permission_tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn test_copy_preserves_permissions() {
        let temp = setup_test_dir();
        let src = temp.path().join("executable.sh");
        let dest = temp.path().join("executable_copy.sh");

        // Create file with executable permission
        fs::write(&src, "#!/bin/bash\necho hello").unwrap();
        let mut perms = fs::metadata(&src).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&src, perms).unwrap();

        fs::copy(&src, &dest).expect("Copy failed");

        let dest_perms = fs::metadata(&dest).unwrap().permissions();
        // Copy preserves permissions on most Unix systems
        assert!(dest_perms.mode() & 0o111 != 0); // Should be executable
    }

    #[test]
    fn test_read_permissions() {
        let temp = setup_test_dir();
        let file = temp.path().join("file1.txt");

        let metadata = fs::metadata(&file).unwrap();
        let permissions = metadata.permissions();

        // File should be readable
        assert!(permissions.mode() & 0o400 != 0);
    }
}

// ============================================================================
// Concurrent Access Integration Tests
// ============================================================================

#[test]
fn test_concurrent_file_creation() {
    use std::thread;

    let temp = setup_test_dir();
    let base = temp.path().to_path_buf();

    let handles: Vec<_> = (0..10)
        .map(|i| {
            let path = base.clone();
            thread::spawn(move || {
                let file = path.join(format!("concurrent_{}.txt", i));
                fs::write(&file, format!("content {}", i)).unwrap();
                assert!(file.exists());
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }

    // Verify all files were created
    for i in 0..10 {
        assert!(base.join(format!("concurrent_{}.txt", i)).exists());
    }
}
