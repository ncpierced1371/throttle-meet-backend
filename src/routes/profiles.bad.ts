    return {
      id: userId,
      displayName: next.displayName ?? null,
      primaryCar: next.primaryCar ?? null,
      avatarUrl: null,
      email: next.email ?? null,
    };
  });
};

export {};
