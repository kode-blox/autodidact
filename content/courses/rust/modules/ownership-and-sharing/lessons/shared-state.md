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

id: '01-02'
course: rust
title: Shared Ownership and Concurrency
description: Separate shared ownership, synchronized mutation, and worker completion with Arc, Mutex, and thread joins.
---

## Separate three responsibilities

Suppose four workers need to update one completion counter. We need to keep the counter alive, coordinate access to it, and know when all workers have finished. These are three distinct responsibilities.

In [Ownership at Function Boundaries](./ownership-boundaries.md), a queue became the sole owner of a message. Here, several workers must own access to the same allocation. The following complete teaching program uses operating-system threads and the standard library. Put it in the scratch project's `src/main.rs`:

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let completed = Arc::new(Mutex::new(0_u32));
    let mut workers = Vec::new();

    for _ in 0..4 {
        let completed = Arc::clone(&completed);
        workers.push(thread::spawn(move || {
            let mut count = completed.lock().expect("counter lock poisoned");
            *count += 1;
        }));
    }

    for worker in workers {
        worker.join().expect("worker panicked");
    }

    let result = *completed.lock().expect("counter lock poisoned");
    assert_eq!(result, 4);
    println!("completed: {result}");
}
```

Run `cargo run`. The output is `completed: 4`; the workers' execution order is deliberately unspecified.

## Share ownership deliberately

`Arc::clone(&completed)` creates another owning handle to the same allocation and increases its strong reference count. It does not clone the mutex or create another counter. In the loop, the inner binding shadows the outer name and moves into the closure. The original handle remains available in `main`.

When the last strong owner disappears, Rust drops the contained value. That lifetime management does not make `Arc` a global variable. This program constructs the shared state locally and hands each worker a handle. A separate `Arc::new` creates separate state.

Passing the closure to `thread::spawn` crosses a thread boundary. Its `Send` and lifetime requirements constrain what the closure can capture. The `move` keyword transfers captured values into the closure; it does not automatically make those values safe to send between threads.

## Coordinate mutation with a guard

`Arc` supplies shared ownership. `Mutex` supplies exclusive access to the counter during each update. Calling `lock()` returns a guard; dereferencing that guard lets the worker modify the protected `u32`. When the closure ends, the guard is dropped and the lock is released.

The increment is short, but it still requires coordination. Four workers owning handles to one counter does not mean four unsynchronized mutable references are allowed. An `Arc<RefCell<u32>>` would not meet the required thread-safety bounds: sharing the allocation cannot give its contents missing synchronization guarantees.

These are blocking standard-library locks on operating-system threads. A standard mutex can also suit short, low-contention critical sections in an asynchronous service. Review lock choice and duration against the executor, and release the guard before an `.await`. Holding it while waiting for unrelated work can block progress. Use an appropriate asynchronous coordination primitive when the operation requires asynchronous waiting.

## Establish completion separately

The join loop waits for every worker before the final read. Taking the lock once in `main` without joining would only acquire access at that moment; workers might still have increments left to perform. A reference count is also not a completion protocol.

Rust's memory-safety rules do not guarantee deadlock freedom. If `main` holds the counter's guard while joining a worker that still needs the lock, the worker cannot finish and `main` cannot finish its join. Taking that guard after spawning workers can produce this cycle, depending on which workers have already finished.

The `expect` calls make this teaching program stop on lock poisoning or a worker panic reported by `join`. A production component needs an explicit failure policy; blindly adopting these messages does not supply recovery behavior.

## Practical lab

1. Change the worker count to eight and adjust the assertion. Run it repeatedly. Explain why the final count is stable even though the schedule changes.
2. On paper, acquire a guard immediately after initializing `completed`, before spawning any workers. Keep that guard alive while `main` calls `join()`. Draw the waiting relationship: every worker needs the lock held by `main`, while `main` waits for a worker to finish. Do not run this deliberate deadlock.
3. Explain why replacing the per-worker `Arc::clone` with `Arc::new(Mutex::new(0_u32))` would give workers independent counters.

<details>
<summary>Hint: name the mechanism responsible for each guarantee</summary>

Use three labels: ownership keeps the allocation alive, locking coordinates access, and joining establishes worker completion. Identify which label applies to each line before predicting a change's behavior.

</details>

## Checkpoint

Explain what is cloned, what is locked, when the lock is released, and why the joins precede the final assertion. Then describe one change that would compile yet prevent progress.

## Sources

- [Standard library: Arc and thread-safety bounds](https://doc.rust-lang.org/std/sync/struct.Arc.html)
- [Standard library: Mutex, guards, and poisoning](https://doc.rust-lang.org/std/sync/struct.Mutex.html)
- [Standard library: thread spawning and joining](https://doc.rust-lang.org/std/thread/fn.spawn.html)
- [The Rust Book: shared-state concurrency](https://doc.rust-lang.org/book/ch16-03-shared-state.html)
- [Tokio: choosing and scoping shared-state locks](https://tokio.rs/tokio/tutorial/shared-state)
