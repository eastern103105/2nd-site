# Verification and Deployment Walkthrough

## 1. Build Verification
We have successfully resolved the linting errors. To verify the build locally:

1.  Open a terminal in the `client` directory.
2.  Run the build command:
    ```bash
    npx vite build
    ```
    *Note: If `npm run build` fails, use `npx vite build` directly.*

## 2. Feature Verification
Please verify the following features in the application:

### Admin Side (`/student-management`)
1.  **Multi-Book Selection:**
    *   Go to Student Management.
    *   Select a student.
    *   In the "학습 중인 단어장" section, verify you can select multiple books.
    *   In the "학습 대기열" section, verify you can add books to the queue.
    *   Save settings and refresh to ensure they persist.

### Student Side (`/student`)
1.  **Dashboard:**
    *   Log in as a student with multiple active books.
    *   Verify tabs appear for each active book.
    *   Switching tabs should update the progress bar and "Today's Study" range.
2.  **Study & Test:**
    *   Start studying a book.
    *   Complete the test.
    *   Verify the progress updates for *that specific book*.
3.  **Auto-Sequencing:**
    *   (Optional) Set a student's progress near the end of a book.
    *   Complete the book.
    *   Verify the system alerts you that the book is finished and the next book in the queue has started.

## 3. Deployment
Once verified, deploy the changes to Firebase Hosting:

```bash
firebase deploy --only hosting
```
