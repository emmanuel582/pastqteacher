# Future student-app connection

These routes belong to the standalone teacher service. They are implemented and tested, but the existing student UI is deliberately unchanged. The teacher API must allow the student’s exact HTTPS origin in `STUDENT_ORIGIN`.

All requests require `Authorization: Bearer <Supabase access token>`. Requests act as that verified student; no client-supplied student ID, grade, price, deadline, or payment status is trusted.

| Route | Purpose |
| --- | --- |
| `GET /api/exams?search=` | Public published exams and this student’s enrolled exams. |
| `POST /api/exams/resolve` | Body `{ id }` for public/already joined exams, or `{ code }` for private invites. Returns safe exam details. |
| `POST /api/exams/join` | Same lookup body. Free exams enroll immediately. Paid exams return HTTP 402 with `{ paymentRequired, orderId, checkoutUrl }`. |
| `GET /api/exams/orders/:id` | Read this student’s order status after checkout. Wait for `paid`; a success URL is insufficient. |
| `POST /api/exams/:id/attempts` | Start or resume this student’s current attempt, enforcing time window, enrollment, and attempt count. |
| `GET /api/exams/attempts/:id` | Resume this student’s attempt. Expired attempts finalize the last saved answers. |
| `PUT /api/exams/attempts/:id/answers` | Body `{ revision, answers: { [questionKey]: optionIndexOrWrittenTextOrNull } }`. Returns the new revision. HTTP 409 means reload the latest saved state before retrying. |
| `POST /api/exams/attempts/:id/submit` | Submit saved answers. Repeated submission returns the same result. |

The attempt includes the server deadline, shuffled question snapshot, answer state, revision, and only the image assets needed for visible content. Correct choices, explanations, source answers, and answer-only images are withheld until submission, grading, and the teacher’s release policy permit them. Written responses require teacher marking. When solutions are disabled, source answers remain hidden.

The student should autosave before submitting, use the server deadline for its timer, handle expired/closed sessions explicitly, and refresh the same attempt after reconnect. The answer-save revision prevents concurrent tabs from silently overwriting newer work. The server never accepts a browser-calculated score.

Closing an exam prevents new enrollment/attempts; already running attempts keep their original deadlines. The optional closing date caps all attempt deadlines. Private code rotation affects future joins and preserves enrolled students. Published question content cannot be edited; duplicates are new exam sessions.
