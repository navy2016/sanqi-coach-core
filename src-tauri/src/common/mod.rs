pub mod error;
pub mod rating;

pub use error::{CoreError, CoreResult};
pub use rating::{Grade, MoveGrade, detect_turning_points};