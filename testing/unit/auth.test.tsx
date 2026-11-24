// testing/unit/auth.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initializeDatabase,
  getSystemUsers,
  saveSystemUser,
  deleteSystemUser
} from "@/utils/db";

// Mock localStorage for test environment
class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }
}

const mockLocalStorage = new LocalStorageMock();

describe("System Users / Authentication Test Suite", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage
    });
    vi.stubGlobal("localStorage", mockLocalStorage);
    mockLocalStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should initialize default system users when database is empty", async () => {
    initializeDatabase();
    const users = await getSystemUsers();
    
    // ตรวจสอบว่ามีผู้ใช้ตั้งต้น 3 คน
    expect(users).toHaveLength(3);
    
    // บัญชีผู้ดูแลระบบสูงสุด (super_manager_user)
    const superUser = users.find(u => u.username === "super_manager_user");
    expect(superUser).toBeDefined();
    expect(superUser?.role).toBe("super-manager");
    expect(superUser?.displayName).toBe("Super Manager");
    expect(superUser?.password).toBe("123456");

    // บัญชีผู้จัดการร้าน (manager_user)
    const managerUser = users.find(u => u.username === "manager_user");
    expect(managerUser).toBeDefined();
    expect(managerUser?.role).toBe("manager");
    expect(managerUser?.displayName).toBe("Manager User");
    expect(managerUser?.password).toBe("123456");

    // บัญชีแอดมินทั่วไป (admin_user)
    const adminUser = users.find(u => u.username === "admin_user");
    expect(adminUser).toBeDefined();
    expect(adminUser?.role).toBe("admin");
    expect(adminUser?.displayName).toBe("Admin User");
    expect(adminUser?.password).toBe("123456");
  });

  it("should add and retrieve a new system user successfully", async () => {
    initializeDatabase();
    
    const newUser = {
      username: "manager_tester",
      password: "password123",
      role: "manager" as const,
      displayName: "Tester Manager",
      fullName: "ผู้จัดทดสอบ ระบบ"
    };

    await saveSystemUser(newUser);

    const users = await getSystemUsers();
    const found = users.find(u => u.username === "manager_tester");
    
    expect(found).toBeDefined();
    expect(found?.displayName).toBe("Tester Manager");
    expect(found?.role).toBe("manager");
    expect(found?.password).toBe("password123");
  });

  it("should update an existing system user fields successfully", async () => {
    initializeDatabase();

    // บดบังหรือแก้ไขรหัสผ่านและชื่อแสดงผลของ admin_user
    const existingList = await getSystemUsers();
    const existing = existingList.find(u => u.username === "admin_user")!;
    const updated = {
      ...existing,
      displayName: "New Admin Name",
      password: "newsecurepassword"
    };

    await saveSystemUser(updated);

    const users = await getSystemUsers();
    const found = users.find(u => u.username === "admin_user");
    
    expect(found?.displayName).toBe("New Admin Name");
    expect(found?.password).toBe("newsecurepassword");
    // สิทธิ์ต้องเป็นอันเดิม
    expect(found?.role).toBe("admin");
  });

  it("should delete a system user from database successfully", async () => {
    initializeDatabase();
    
    // ลบ manager_user ออกจากระบบ
    await deleteSystemUser("manager_user");

    const users = await getSystemUsers();
    const found = users.find(u => u.username === "manager_user");
    
    expect(found).toBeUndefined();
    // บัญชีอื่นๆ ยังคงอยู่
    expect(users.find(u => u.username === "super_manager_user")).toBeDefined();
  });
});
