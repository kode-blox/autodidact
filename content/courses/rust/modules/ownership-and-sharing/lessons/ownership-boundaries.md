---
# Copyright 2026 Sayak Mukhopadhyay
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

id: '01-01'
course: rust
title: Ownership at Function Boundaries
description: Choose between moving a value, borrowing it, and cloning it by tracing a message into a queue.
---

## Give each function a responsibility

Consider a message entering a service. One function cleans it, another previews it, and a queue retains it for later work. These operations need different relationships with the same data. Rust makes those relationships part of their signatures.

The following is a complete teaching program for `src/main.rs`, rather than an excerpt from an application:

```rust
fn normalize(message: &mut String) {
    *message = message.trim().to_owned();
}

fn first_word(message: &str) -> &str {
    message.split_whitespace().next().unwrap_or("")
}

fn enqueue(pending: &mut Vec<String>, message: String) {
    pending.push(message);
}

fn main() {
    let mut pending = Vec::new();
    let mut message = String::from("  calibrate the sensor  ");

    normalize(&mut message);
    let preview = first_word(&message);
    println!("preview: {preview}");

    enqueue(&mut pending, message);
    println!("queued: {}", pending[0]);
}
```

The output is:

```text
preview: calibrate
queued: calibrate the sensor
```

## Read the ownership contract

| Parameter              | Permission or responsibility                 | What the caller keeps                            |
| ---------------------- | -------------------------------------------- | ------------------------------------------------ |
| `message: String`      | Receive ownership of the string.             | No usable value through the moved binding.       |
| `message: &str`        | Inspect a borrowed string slice.             | Ownership of the underlying text.                |
| `message: &mut String` | Borrow the string exclusively and change it. | Ownership, subject to the borrow's restrictions. |

`normalize` replaces the string's contents through a mutable reference. It does not acquire ownership of the caller's `String` variable. Its `to_owned()` allocates the trimmed replacement; that allocation is a choice made by this normalization implementation.

`first_word` needs only a view. The returned `&str` refers to text owned by `message`; it does not allocate another string. Rust's lifetime rules connect the returned reference to the input reference. They constrain valid uses of the view without extending the owner's life.

`enqueue` has a different job: its `Vec<String>` must retain the message after the call returns. Passing `message` transfers ownership into the parameter, then `push` transfers it into the vector. The original binding becomes unusable. This move does not clone the string's character buffer. The vector's element owns that buffer until it is moved again or dropped.

## Follow the last use of a borrow

The `preview` binding remains in the block when `enqueue` runs, but its last use is the preceding `println!`. The compiler can end this shared borrow there. You do not need another nested block merely to make the ownership transfer legal.

Now imagine adding another use of `preview` after the enqueue. That view would need the original borrowed text to remain valid across a move of its owner. The compiler rejects the changed program. Read the diagnostic as a disagreement between responsibilities: should a preview remain usable, should the queue own the message now, or should an independent copy exist?

Use `.clone()` when a second owned value is actually required. Adding it automatically can hide an avoidable copy or preserve an unclear API boundary.

## Practical lab

Create a scratch project outside your application repositories:

```powershell
cargo new rust-ownership-lab --edition 2024
cd rust-ownership-lab
```

Put the complete program in `src/main.rs` and run `cargo run`. Then make each change separately, restoring the working example between experiments:

1. Insert `message.push_str("!");` immediately before `println!("preview: {preview}");`. Predict the conflict, then compile. Expect E0502: the mutation overlaps a shared borrow that will still be used. Move the inserted line after that `println!` and run again.
2. Insert `println!("original: {message}");` immediately after `enqueue(&mut pending, message);`. Expect E0382: the binding was moved. Read the queued value instead. If another component genuinely needs an independent original, make that copy an explicit design decision.
3. Write down why `enqueue` takes ownership while `first_word` borrows. Changing both parameters to references would change what those functions can retain.

<details>
<summary>Hint: a binding's block is not always the borrow's duration</summary>

Find the last expression that uses `preview`. A later reference use can extend the borrow's required duration; the presence of an unused binding alone does not do that.

</details>

## Checkpoint

Trace the message's owner before normalization, during preview, and after enqueue. Explain both compiler errors without using “Rust does not like it” as the reason. Continue to [Shared Ownership and Concurrency](./shared-state.md) when you can justify the three signatures.

## Sources

- [The Rust Book: ownership and moves](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html)
- [The Rust Book: references, borrowing, and reference scope](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html)
