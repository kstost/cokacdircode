use std::path::PathBuf;

/// Expand a leading `~`, `~/`, or `~\` in a user-supplied path to the current user's home directory.
///
/// Conservative matching:
/// - `"~"` alone → home
/// - `"~/..."` or `"~\..."` → home joined with the remainder
/// - `"~user/..."`, `"~~/..."`, `"foo/~/bar"` → returned unchanged
///
/// If the home directory cannot be determined, the original string is returned unchanged
/// so callers fall through to their normal "not found" handling.
pub fn expand_tilde(path: &str) -> String {
    if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home.display().to_string();
        }
        return path.to_string();
    }
    if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return PathBuf::from(home).join(rest).display().to_string();
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home() -> String {
        dirs::home_dir().unwrap().display().to_string()
    }

    #[test]
    fn tilde_alone_expands_to_home() {
        assert_eq!(expand_tilde("~"), home());
    }

    #[test]
    fn tilde_slash_resolves_to_home() {
        // Compare via Path components so the test does not depend on whether
        // PathBuf::push("") appends a trailing MAIN_SEPARATOR (an std impl
        // detail that also varies if HOME itself ends with a separator or is
        // a Windows drive root / verbatim path).
        let out = expand_tilde("~/");
        let home = dirs::home_dir().unwrap();
        let out_components: Vec<_> = std::path::Path::new(&out).components().collect();
        let home_components: Vec<_> = home.components().collect();
        assert_eq!(
            out_components, home_components,
            "expected ~/ to resolve to home (got {:?}, home {:?})",
            out, home
        );
    }

    #[test]
    fn tilde_with_subpath_expands() {
        let expected = PathBuf::from(home()).join("a/b").display().to_string();
        assert_eq!(expand_tilde("~/a/b"), expected);
    }

    #[test]
    fn tilde_backslash_expands() {
        let expected = PathBuf::from(home()).join("a").display().to_string();
        assert_eq!(expand_tilde("~\\a"), expected);
    }

    #[test]
    fn tilde_backslash_alone_expands_to_home() {
        let out = expand_tilde("~\\");
        let home = dirs::home_dir().unwrap();
        let out_components: Vec<_> = std::path::Path::new(&out).components().collect();
        let home_components: Vec<_> = home.components().collect();
        assert_eq!(out_components, home_components);
    }

    #[test]
    fn tilde_user_form_is_not_expanded() {
        assert_eq!(expand_tilde("~user/x"), "~user/x");
    }

    #[test]
    fn double_tilde_is_not_expanded() {
        assert_eq!(expand_tilde("~~/x"), "~~/x");
    }

    #[test]
    fn middle_tilde_is_not_expanded() {
        assert_eq!(expand_tilde("foo/~/x"), "foo/~/x");
    }

    #[test]
    fn absolute_path_is_unchanged() {
        assert_eq!(expand_tilde("/abs/path"), "/abs/path");
    }

    #[test]
    fn relative_path_is_unchanged() {
        assert_eq!(expand_tilde("relative"), "relative");
    }

    #[test]
    fn empty_is_unchanged() {
        assert_eq!(expand_tilde(""), "");
    }
}
